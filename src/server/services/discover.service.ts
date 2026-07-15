import "server-only";
import { searchNppes } from "@/server/integrations/nppes";
import { leadRepository } from "@/server/repositories/lead.repository";
import { candidateRepository } from "@/server/repositories/candidate.repository";
import { classifyDiscoverRow, type DupCandidateSets } from "@/lib/rules/discover-dedupe";
import { TAXONOMY_OPTIONS } from "@/lib/constants";
import { writeAudit } from "@/server/db/audit";
import { withTransaction } from "@/server/db/with-transaction";
import { checkRateLimit } from "@/server/http/rate-limit";
import type { AuthUser } from "@/server/auth/guards";
import type {
  DiscoverAddToSourcingInput,
  DiscoverResultItemDTO,
  DiscoverSearchQuery,
  DiscoverSearchResultDTO,
} from "@/lib/validation/discover";

/** Mapped-but-not-yet-classified search row (internal — carries `fullName` for dedupe lookup). */
interface MappedRow {
  npi: string;
  firstName: string;
  lastName: string;
  fullName: string;
  credential: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  taxonomyDesc: string | null;
  licenseNumber: string | null;
  licenseState: string | null;
}

function mapResult(
  raw: Awaited<ReturnType<typeof searchNppes>>["results"][number],
  fallbackCredential: string | null,
): MappedRow {
  const addr = raw.addresses.find((a) => a.address_purpose === "LOCATION") ?? raw.addresses[0];
  const tax = raw.taxonomies.find((t) => t.primary) ?? raw.taxonomies[0];
  const firstName = raw.basic.first_name ?? "";
  const lastName = raw.basic.last_name ?? "";
  return {
    npi: raw.number,
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`.trim(),
    credential: raw.basic.credential || fallbackCredential,
    city: addr?.city ?? null,
    state: addr?.state ?? null,
    phone: addr?.telephone_number ?? null,
    taxonomyDesc: tax?.desc ?? null,
    licenseNumber: tax?.license ?? null,
    licenseState: tax?.state ?? addr?.state ?? null,
  };
}

async function buildDupSets(npis: string[], names: string[]): Promise<DupCandidateSets> {
  const [byNpi, byName, candByName] = await Promise.all([
    leadRepository.findManyByNpis(npis),
    leadRepository.findManyByNames(names),
    candidateRepository.findManyByNames(names),
  ]);
  return {
    leadsByNpi: new Map(byNpi.map((l) => [l.npi!, { id: l.id, status: l.status }])),
    leadsByName: new Map(
      byName.map((l) => [l.name.trim().toLowerCase(), { id: l.id, status: l.status }]),
    ),
    candidatesByName: new Map(
      candByName.map((c) => [c.name.trim().toLowerCase(), { id: c.id, status: c.status }]),
    ),
  };
}

/**
 * Discover / NPPES (Wave 2.7) — the "find" step of the funnel. Kept out of `lead.service.ts`
 * (already ~630 lines covering the full lead lifecycle) since this composes a genuinely different
 * concern: an external HTTP call + dedupe classification, sharing almost no logic with
 * logOutreach/respond/promote. Still calls `leadRepository` directly, same as any other service.
 */
export const discoverService = {
  /** Search NPPES and classify every result against existing leads/candidates. Rate-limited
   *  per-user (unlike other RSC-read services) since this has real external-API cost/abuse
   *  surface a normal DB read doesn't. */
  async search(query: DiscoverSearchQuery, user: AuthUser): Promise<DiscoverSearchResultDTO> {
    checkRateLimit(`discover-search:${user.id}`, { limit: 20, windowMs: 60_000 });

    const taxonomyOpt = TAXONOMY_OPTIONS.find((t) => t.value === query.taxonomy);
    const { resultCount, results } = await searchNppes({
      taxonomyDescription: taxonomyOpt?.query,
      state: query.state,
      city: query.city,
      firstName: query.firstName,
      lastName: query.lastName,
    });

    const rows = results.map((r) => mapResult(r, taxonomyOpt?.credential ?? null));
    const sets = await buildDupSets(
      rows.map((r) => r.npi),
      rows.map((r) => r.fullName.toLowerCase()),
    );

    const items: DiscoverResultItemDTO[] = rows.map((row) => {
      const dup = classifyDiscoverRow({ npi: row.npi, fullName: row.fullName }, sets);
      return {
        npi: row.npi,
        firstName: row.firstName,
        lastName: row.lastName,
        credential: row.credential,
        city: row.city,
        state: row.state,
        phone: row.phone,
        taxonomyDesc: row.taxonomyDesc,
        licenseNumber: row.licenseNumber,
        licenseState: row.licenseState,
        dupStatus: dup.status,
        dupMatchId: dup.matchedId,
        dupMatchLabel: dup.matchedLabel,
      };
    });

    return { results: items, resultCount };
  },

  /** Bulk-add the caller's selected NPPES rows to Sourcing. Re-derives the dedupe sets fresh
   *  (defends against a race since the search happened moments earlier client-side) rather than
   *  trusting the client's `dupStatus` from the search response. */
  async addToSourcing(
    input: DiscoverAddToSourcingInput,
    user: AuthUser,
  ): Promise<{ added: number; skipped: number }> {
    checkRateLimit(`discover-add:${user.id}`, { limit: 10, windowMs: 60_000 });

    const npis = input.rows.map((r) => r.npi);
    const names = input.rows.map((r) => r.name.trim().toLowerCase());
    const sets = await buildDupSets(npis, names);

    const seen = new Set<string>();
    const kept = input.rows.filter((row) => {
      if (seen.has(row.npi)) return false; // intra-batch dup
      seen.add(row.npi);
      const name = row.name.trim().toLowerCase();
      if (sets.leadsByNpi.has(row.npi)) return false;
      if (sets.leadsByName.has(name)) return false;
      if (sets.candidatesByName.has(name)) return false;
      return true;
    });

    if (kept.length > 0) {
      await withTransaction(async (tx) => {
        await leadRepository.createMany(
          kept.map((row) => ({
            name: row.name,
            npi: row.npi,
            phone: row.phone ?? null,
            credential: row.credential ?? null,
            state: row.state ?? null,
            source: "NPPES",
            clientId: input.clientId ?? null,
            notes:
              [
                row.taxonomyDesc ? `Taxonomy: ${row.taxonomyDesc}` : null,
                row.licenseNumber ? `License: ${row.licenseNumber}` : null,
              ]
                .filter(Boolean)
                .join(" · ") || null,
            status: "Sourced",
            outreachCount: 0,
            createdById: user.id,
          })),
          tx,
          { skipDuplicates: true },
        );
        await writeAudit(tx, {
          entity: "source_lead",
          entityId: "bulk",
          actor: user.id,
          action: "add_from_discover",
          after: { count: kept.length, source: "NPPES" },
        });
      });
    }

    return { added: kept.length, skipped: input.rows.length - kept.length };
  },
};
