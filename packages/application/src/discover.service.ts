import { searchNppes } from "@destaworks/integrations/nppes";
import { leadRepository } from "@destaworks/db/repositories/lead.repository";
import { candidateRepository } from "@destaworks/db/repositories/candidate.repository";
import { openRoleRepository } from "@destaworks/db/repositories/open-role.repository";
import {
  classifyDiscoverRow,
  type DupCandidateSets,
} from "@destaworks/domain/rules/discover-dedupe";
import { TAXONOMY_OPTIONS, taxonomyForCredential } from "@destaworks/domain/constants";
import { defined } from "@destaworks/domain/utils/defined";
import { writeAudit } from "@destaworks/db/audit";
import { withTransaction } from "@destaworks/db/with-transaction";
import { checkRateLimit } from "@destaworks/integrations/http/rate-limit";
import { AppError } from "@destaworks/integrations/http/app-error";
import type { AuthUser } from "@destaworks/auth/guards";
import type {
  CoverageGapRowDTO,
  CoverageGapSupplyDTO,
  CoverageGapSupplyQuery,
  DiscoverAddToSourcingInput,
  DiscoverResultItemDTO,
  DiscoverSearchQuery,
  DiscoverSearchResultDTO,
} from "@destaworks/contracts/validation/discover";

/** Mapped-but-not-yet-classified search row. Exported for reuse by `similarity.service.ts`
 *  (Wave 3.2) — carries `fullName` for dedupe lookup. */
export interface MappedRow {
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

/** Exported for reuse by `similarity.service.ts` (Wave 3.2) — same NPPES-row-to-internal-shape mapping. */
export function mapResult(
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

/** Exported for reuse by `similarity.service.ts` (Wave 3.2) — same cross-system dedupe read. */
export async function buildDupSets(npis: string[], names: string[]): Promise<DupCandidateSets> {
  const [byNpi, byName, candByName] = await Promise.all([
    leadRepository.findManyByNpis(npis),
    leadRepository.findManyByNames(names),
    candidateRepository.findManyByNames(names),
  ]);
  const leadsByNpi: DupCandidateSets["leadsByNpi"] = new Map();
  for (const l of byNpi) {
    if (l.npi !== null) leadsByNpi.set(l.npi, { id: l.id, status: l.status });
  }
  return {
    leadsByNpi,
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
    await checkRateLimit(`discover-search:${user.id}`, { limit: 20, windowMs: 60_000 });

    const taxonomyOpt = TAXONOMY_OPTIONS.find((t) => t.value === query.taxonomy);
    const { resultCount, results } = await searchNppes(
      defined({
        taxonomyDescription: taxonomyOpt?.query,
        state: query.state,
        city: query.city,
        firstName: query.firstName,
        lastName: query.lastName,
      }),
    );

    const mapped = results.map((r) => mapResult(r, taxonomyOpt?.credential ?? null));
    // NPPES's own taxonomy_description match is loose (e.g. "Clinical" also surfaces
    // neurologists/geneticists) — require the EXACT target description when a taxonomy was
    // selected, never trust the query alone for precision.
    const rows = taxonomyOpt
      ? mapped.filter((r) => r.taxonomyDesc === taxonomyOpt.matchDesc)
      : mapped;
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
    await checkRateLimit(`discover-add:${user.id}`, { limit: 10, windowMs: 60_000 });

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

  /**
   * Coverage-gap widget (Wave 5.5 backlog, legacy Drop 68 "Coverage Gaps"): open-role demand vs.
   * sourced/pipeline supply, grouped by (credential, state). Three grouped queries joined
   * in-memory by combo key — cheaper than one query per combo. NPPES supply is NOT included here
   * (see `supplyForCombo`) — that's a live external call, kept lazy/on-demand per combo instead of
   * fired for every row on every page load.
   */
  async coverageGaps(): Promise<CoverageGapRowDTO[]> {
    const [roleGroups, poolGroups, pipelineGroups] = await Promise.all([
      openRoleRepository.groupOpenByCredentialState(),
      leadRepository.groupByCredentialState(),
      candidateRepository.groupActiveByCredentialState(),
    ]);

    const key = (credential: string | null, state: string | null) => `${credential}::${state}`;
    const poolByKey = new Map(poolGroups.map((g) => [key(g.credential, g.state), g._count._all]));
    const pipelineByKey = new Map(
      pipelineGroups.map((g) => [key(g.credential, g.state), g._count._all]),
    );

    return roleGroups
      .flatMap((g) => {
        const { credential, state } = g;
        if (credential === null || state === null) return [];
        return [
          {
            credential,
            state,
            roleCount: g._count._all,
            poolCount: poolByKey.get(key(credential, state)) ?? 0,
            pipelineCount: pipelineByKey.get(key(credential, state)) ?? 0,
          },
        ];
      })
      .sort((a, b) => b.roleCount - a.roleCount);
  },

  /** Live NPPES supply for one (credential, state) combo — lazy/on-demand, rate-limited. */
  async supplyForCombo(
    query: CoverageGapSupplyQuery,
    user: AuthUser,
  ): Promise<CoverageGapSupplyDTO> {
    const taxonomyOpt = taxonomyForCredential(query.credential);
    if (!taxonomyOpt) {
      throw new AppError("BAD_REQUEST", "No NPPES supply lookup available for this credential yet");
    }

    await checkRateLimit(`discover-supply:${user.id}`, { limit: 20, windowMs: 60_000 });

    const { results } = await searchNppes({
      taxonomyDescription: taxonomyOpt.query,
      state: query.state,
    });
    const matched = results.filter((r) => {
      const tax = r.taxonomies.find((t) => t.primary) ?? r.taxonomies[0];
      return tax?.desc === taxonomyOpt.matchDesc;
    });
    return { supply: matched.length };
  },
};
