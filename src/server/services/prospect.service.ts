import "server-only";
import { canEditProspect, canManageContacts } from "@/lib/rules/prospect-lifecycle";
import { specialtyTaxonomyQuery, type ProspectStatus } from "@/lib/constants";
import type {
  AddProspectContactInput,
  AddProspectInput,
  AddProspectsFromSearchInput,
  BulkProspectActionInput,
  ProspectContactDTO,
  ProspectDetailDTO,
  ProspectListDTO,
  ProspectListItemDTO,
  ProspectSearchResultDTO,
  ProspectSearchResultItemDTO,
  SearchProspectsQuery,
  UpdateProspectInput,
} from "@/lib/validation/prospect";
import { toIso, isoOrNull } from "@/lib/utils/iso";
import { defined } from "@/lib/utils/defined";
import { pageMeta } from "@/lib/pagination";
import type { AuthUser } from "@/server/auth/guards";
import { writeAudit } from "@/server/db/audit";
import { withTransaction } from "@/server/db/with-transaction";
import { prospectRepository, type ProspectRow } from "@/server/repositories/prospect.repository";
import {
  prospectContactRepository,
  type ProspectContactRow,
} from "@/server/repositories/prospect-contact.repository";
import { userRepository } from "@/server/repositories/user.repository";
import { searchNppes } from "@/server/integrations/nppes";
import { findApolloContacts } from "@/server/integrations/apollo";
import { findHunterContacts } from "@/server/integrations/hunter";
import { checkRateLimit } from "@/server/http/rate-limit";
import { AppError } from "@/server/http/app-error";

/** One OFFSET page of the `/client-discovery` inventory (matches Sourcing's `LIST_PAGE`). */
const LIST_PAGE = 25;

/** Filters accepted by the `/client-discovery` list read. */
export interface ProspectListFilters {
  status?: string;
  ownerId?: string;
  source?: string;
  search?: string;
  includeDeleted?: boolean;
  page?: number;
}

function toProspectListItem(
  row: ProspectRow,
  ownerNames: Map<string, string>,
): ProspectListItemDTO {
  return {
    id: row.id,
    practiceName: row.practiceName,
    npi: row.npi,
    taxonomy: row.taxonomy,
    city: row.city,
    state: row.state,
    zip: row.zip,
    phone: row.phone,
    website: row.website,
    status: row.status as ProspectStatus,
    ownerName: row.ownerId ? (ownerNames.get(row.ownerId) ?? null) : null,
    source: row.source,
    createdAt: toIso(row.createdAt),
    deletedAt: isoOrNull(row.deletedAt),
  };
}

function toContactDTO(row: ProspectContactRow): ProspectContactDTO {
  return {
    id: row.id,
    fullName: row.fullName,
    title: row.title,
    email: row.email,
    phone: row.phone,
    linkedinUrl: row.linkedinUrl,
    seniority: row.seniority,
    source: row.source,
    notes: row.notes,
    createdAt: toIso(row.createdAt),
  };
}

async function toProspectDetail(row: ProspectRow): Promise<ProspectDetailDTO> {
  const [contacts, ownerNames] = await Promise.all([
    prospectContactRepository.listByProspect(row.id),
    userRepository.namesByIds(row.ownerId ? [row.ownerId] : []),
  ]);
  return {
    ...toProspectListItem(row, ownerNames),
    notes: row.notes,
    ownerId: row.ownerId,
    icpId: row.icpId,
    contacts: contacts.map(toContactDTO),
  };
}

/** Load a live prospect or throw NOT_FOUND (missing OR soft-deleted). */
async function requireProspect(id: string): Promise<ProspectRow> {
  const prospect = await prospectRepository.findById(id);
  if (!prospect) throw new AppError("NOT_FOUND", "Prospect not found");
  return prospect;
}

/** `https://sterling.example/contact` → `sterling.example`; `null` for an unparseable/missing URL. */
function extractDomain(website: string | null): string | null {
  if (!website) return null;
  try {
    return new URL(website).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Shared by `enrichContacts`/`findContactsHunter` — both persist whatever the provider found
 *  (if any) and write one audit record in the same transaction; they differ only in the
 *  contact `source` label and the audit `action` name. */
async function persistFoundContacts(
  prospectId: string,
  found: {
    fullName: string;
    title: string | null;
    email: string | null;
    phone: string | null;
    linkedinUrl: string | null;
    seniority: string | null;
  }[],
  source: "Apollo" | "Hunter",
  auditAction: string,
  user: AuthUser,
): Promise<void> {
  await withTransaction(async (tx) => {
    if (found.length > 0) {
      await prospectContactRepository.createMany(
        found.map((c) => ({
          prospectId,
          fullName: c.fullName,
          title: c.title,
          email: c.email,
          phone: c.phone,
          linkedinUrl: c.linkedinUrl,
          seniority: c.seniority,
          source,
        })),
        tx,
      );
    }
    await writeAudit(tx, {
      entity: "prospect",
      entityId: prospectId,
      actor: user.id,
      action: auditAction,
      after: { found: found.length },
    });
  });
}

/**
 * Client Discovery — B2B prospecting (new domain, core slice). Owns authZ + the DTO shape + the
 * pipeline writes; never touches Prisma directly. Every route calls `requireCapability
 * ("viewClientDiscovery")` before reaching this service — mirrors `leadService`'s layering.
 */
export const prospectService = {
  /** Search NPPES for organizations (NPI-2). Rate-limited per-user — real external-API cost.
   *  NPI-keyed dedupe only, intentionally NOT `src/lib/rules/discover-dedupe.ts`'s
   *  `buildDupSets` — that module classifies across three source types (Lead-by-NPI,
   *  Lead-by-name, Candidate-by-name) for a UI status badge, a materially different problem
   *  from flagging "is this NPI already a tracked Prospect." */
  async search(query: SearchProspectsQuery, user: AuthUser): Promise<ProspectSearchResultDTO> {
    await checkRateLimit(`client-discovery-search:${user.id}`, { limit: 20, windowMs: 60_000 });

    const { resultCount, results } = await searchNppes(
      defined({
        enumerationType: "NPI-2" as const,
        taxonomyDescription: query.taxonomy ? specialtyTaxonomyQuery(query.taxonomy) : undefined,
        state: query.state,
        city: query.city,
        zip: query.zip,
      }),
    );

    const npis = results.map((r) => r.number);
    const tracked = await prospectRepository.findManyByNpis(npis);
    const trackedNpis = new Set(tracked.map((t) => t.npi));

    const items: ProspectSearchResultItemDTO[] = results.map((raw) => {
      const addr = raw.addresses.find((a) => a.address_purpose === "LOCATION") ?? raw.addresses[0];
      const tax = raw.taxonomies.find((t) => t.primary) ?? raw.taxonomies[0];
      return {
        npi: raw.number,
        practiceName: raw.basic.organization_name ?? "",
        taxonomy: tax?.desc ?? null,
        city: addr?.city ?? null,
        state: addr?.state ?? null,
        zip: addr?.postal_code ?? null,
        phone: addr?.telephone_number ?? null,
        alreadyTracked: trackedNpis.has(raw.number),
      };
    });

    return { results: items, resultCount };
  },

  /** Bulk-add selected NPPES rows to the pipeline. Re-derives the dedupe set fresh (defends
   *  against a race since the search happened moments earlier client-side). */
  async addFromSearch(
    input: AddProspectsFromSearchInput,
    user: AuthUser,
  ): Promise<{ added: number; skipped: number }> {
    await checkRateLimit(`prospect-bulk-add:${user.id}`, { limit: 10, windowMs: 60_000 });

    const npis = input.rows.map((r) => r.npi);
    const tracked = await prospectRepository.findManyByNpis(npis);
    const trackedNpis = new Set(tracked.map((t) => t.npi));

    const seen = new Set<string>();
    const kept = input.rows.filter((row) => {
      if (seen.has(row.npi) || trackedNpis.has(row.npi)) return false;
      seen.add(row.npi);
      return true;
    });

    if (kept.length === 0) {
      return { added: 0, skipped: input.rows.length };
    }

    // `createMany`'s `skipDuplicates` can insert fewer rows than `kept.length` if a concurrent
    // request claims one of the same NPIs between the pre-check above and this insert — report
    // the actual inserted count, not the pre-insert candidate count.
    const { count: added } = await withTransaction(async (tx) => {
      const result = await prospectRepository.createMany(
        kept.map((row) => ({
          practiceName: row.practiceName,
          npi: row.npi,
          taxonomy: row.taxonomy ?? null,
          city: row.city ?? null,
          state: row.state ?? null,
          zip: row.zip ?? null,
          phone: row.phone ?? null,
          source: "NPPES Search",
          icpId: input.icpId ?? null,
          status: "Fresh Lead",
          createdById: user.id,
        })),
        tx,
      );
      await writeAudit(tx, {
        entity: "prospect",
        entityId: "bulk",
        actor: user.id,
        action: "add_from_search",
        after: { count: result.count, source: "NPPES Search" },
      });
      return result;
    });

    return { added, skipped: input.rows.length - added };
  },

  /** Add a prospect manually. Starts at "Fresh Lead" / source "Manual" (the service forces both). */
  async create(input: AddProspectInput, user: AuthUser): Promise<ProspectDetailDTO> {
    const prospect = await withTransaction(async (tx) => {
      const created = await prospectRepository.create(
        {
          practiceName: input.practiceName,
          taxonomy: input.taxonomy ?? null,
          city: input.city ?? null,
          state: input.state ?? null,
          zip: input.zip ?? null,
          phone: input.phone ?? null,
          website: input.website ?? null,
          notes: input.notes ?? null,
          status: "Fresh Lead",
          source: "Manual",
          createdById: user.id,
        },
        tx,
      );
      await writeAudit(tx, {
        entity: "prospect",
        entityId: created.id,
        actor: user.id,
        action: "create",
        after: { status: created.status, source: created.source },
      });
      return created;
    });
    return toProspectDetail(prospect);
  },

  /** The `/client-discovery` inventory — one server OFFSET page (Newest-first). */
  async list(filters: ProspectListFilters = {}): Promise<ProspectListDTO> {
    const repoFilters = defined({
      status: filters.status,
      ownerId: filters.ownerId,
      source: filters.source,
      search: filters.search,
      includeDeleted: filters.includeDeleted,
    });
    const total = await prospectRepository.count(repoFilters);
    const meta = pageMeta(total, filters.page ?? 1, LIST_PAGE);
    const rows = await prospectRepository.list({
      ...repoFilters,
      skip: (meta.page - 1) * LIST_PAGE,
      take: LIST_PAGE,
    });
    const ownerNames = await userRepository.namesByIds(
      rows.map((r) => r.ownerId).filter((id): id is string => id !== null),
    );
    const prospects = rows.map((row) => toProspectListItem(row, ownerNames));
    return { prospects, ...meta };
  },

  /** One prospect's full detail (incl. soft-deleted — the "Show deleted" view inspects them too). */
  async detail(id: string): Promise<ProspectDetailDTO> {
    const prospect = await prospectRepository.findById(id, { includeDeleted: true });
    if (!prospect) throw new AppError("NOT_FOUND", "Prospect not found");
    return toProspectDetail(prospect);
  },

  /** Edit a prospect (status/owner/notes/website). Guard `canEditProspect` (a converted "Client"
   *  prospect is terminal → CONFLICT). */
  async update(id: string, input: UpdateProspectInput, user: AuthUser): Promise<ProspectDetailDTO> {
    const existing = await requireProspect(id);
    if (!canEditProspect(existing.status as ProspectStatus)) {
      throw new AppError("CONFLICT", "Prospect already converted to a client");
    }
    const prospect = await withTransaction(async (tx) => {
      const updated = await prospectRepository.update(
        id,
        {
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.website !== undefined ? { website: input.website } : {}),
        },
        tx,
      );
      await writeAudit(tx, {
        entity: "prospect",
        entityId: id,
        actor: user.id,
        action: "update",
        before: { status: existing.status, ownerId: existing.ownerId },
        after: { status: updated.status, ownerId: updated.ownerId },
      });
      return updated;
    });
    return toProspectDetail(prospect);
  },

  /** Enrich a prospect's contacts via Apollo (by practice name + website domain). Rate-limited —
   *  real external-API cost. Guard `canManageContacts` (a converted "Client" is terminal). */
  async enrichContacts(id: string, user: AuthUser): Promise<ProspectDetailDTO> {
    const existing = await requireProspect(id);
    if (!canManageContacts(existing.status as ProspectStatus)) {
      throw new AppError("CONFLICT", "Prospect already converted to a client");
    }
    await checkRateLimit(`client-discovery-enrich:${user.id}`, { limit: 20, windowMs: 60_000 });

    const domain = extractDomain(existing.website);
    const found = await findApolloContacts({
      organizationName: existing.practiceName,
      ...(domain !== null && { domain }),
    });
    await persistFoundContacts(id, found, "Apollo", "enrich_apollo", user);
    return toProspectDetail(existing);
  },

  /** Hunter.io fallback when Apollo has no result — needs the prospect's website domain. */
  async findContactsHunter(id: string, user: AuthUser): Promise<ProspectDetailDTO> {
    const existing = await requireProspect(id);
    if (!canManageContacts(existing.status as ProspectStatus)) {
      throw new AppError("CONFLICT", "Prospect already converted to a client");
    }
    const domain = extractDomain(existing.website);
    if (!domain) {
      throw new AppError(
        "BAD_REQUEST",
        "This prospect has no website on file to search Hunter.io by",
      );
    }
    await checkRateLimit(`client-discovery-enrich:${user.id}`, { limit: 20, windowMs: 60_000 });

    const found = await findHunterContacts({ domain });
    await persistFoundContacts(id, found, "Hunter", "enrich_hunter", user);
    return toProspectDetail(existing);
  },

  /** Add a contact manually. Guard `canManageContacts` (a converted "Client" is terminal). */
  async addContactManual(
    id: string,
    input: AddProspectContactInput,
    user: AuthUser,
  ): Promise<ProspectDetailDTO> {
    const existing = await requireProspect(id);
    if (!canManageContacts(existing.status as ProspectStatus)) {
      throw new AppError("CONFLICT", "Prospect already converted to a client");
    }
    await withTransaction(async (tx) => {
      const created = await prospectContactRepository.create(
        {
          prospectId: id,
          fullName: input.fullName,
          title: input.title ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          linkedinUrl: input.linkedinUrl ?? null,
          seniority: input.seniority ?? null,
          notes: input.notes ?? null,
          source: "Manual",
        },
        tx,
      );
      await writeAudit(tx, {
        entity: "prospect",
        entityId: id,
        actor: user.id,
        action: "add_contact_manual",
        after: { contactId: created.id, fullName: created.fullName },
      });
    });
    return toProspectDetail(existing);
  },

  /** Delete one contact, scoped to its prospect. An id under a different prospect → NOT_FOUND. */
  async deleteContact(id: string, contactId: string, user: AuthUser): Promise<ProspectDetailDTO> {
    const existing = await requireProspect(id);
    await withTransaction(async (tx) => {
      const count = await prospectContactRepository.softDelete(id, contactId, tx);
      if (count === 0) throw new AppError("NOT_FOUND", "Contact not found");
      await writeAudit(tx, {
        entity: "prospect",
        entityId: id,
        actor: user.id,
        action: "delete_contact",
        after: { contactId },
      });
    });
    return toProspectDetail(existing);
  },

  /** Soft-delete a prospect → reversible trash. */
  async softDelete(id: string, user: AuthUser): Promise<{ id: string }> {
    await requireProspect(id);
    await withTransaction(async (tx) => {
      const deleted = await prospectRepository.softDelete(id, user.id, tx);
      await writeAudit(tx, {
        entity: "prospect",
        entityId: id,
        actor: user.id,
        action: "delete",
        before: { deletedAt: null },
        after: { deletedAt: deleted.deletedAt, deletedById: user.id },
      });
    });
    return { id };
  },

  /** Restore a soft-deleted prospect — returns EXACTLY as it was (status untouched). */
  async restore(id: string, user: AuthUser): Promise<ProspectDetailDTO> {
    const existing = await prospectRepository.findById(id, { includeDeleted: true });
    if (!existing) throw new AppError("NOT_FOUND", "Prospect not found");
    if (existing.deletedAt === null) throw new AppError("CONFLICT", "Prospect is not deleted");
    const restored = await withTransaction(async (tx) => {
      const prospect = await prospectRepository.restore(id, tx);
      await writeAudit(tx, {
        entity: "prospect",
        entityId: id,
        actor: user.id,
        action: "restore",
        before: { deletedAt: existing.deletedAt, deletedById: existing.deletedById },
        after: { deletedAt: null, status: prospect.status },
      });
      return prospect;
    });
    return toProspectDetail(restored);
  },

  /**
   * Bulk actions (delete/restore/status/assign). Resolves the working set server-side, SKIPS rows
   * the action can't apply to (a converted "Client" for status/assign), applies the rest in ONE
   * transaction with a per-row audit row, and reports `{ affected, skipped }` honestly.
   */
  async bulkAction(
    input: BulkProspectActionInput,
    user: AuthUser,
  ): Promise<{ affected: number; skipped: number }> {
    const uniqueIds = [...new Set(input.ids)];
    const rows = await prospectRepository.findManyByIds(uniqueIds, {
      includeDeleted: input.action === "restore",
    });
    const byId = new Map(rows.map((r) => [r.id, r]));

    if (input.action === "assign") {
      const names = await userRepository.namesByIds([input.value]);
      if (!names.has(input.value)) throw new AppError("NOT_FOUND", "User not found");
    }

    const eligible = uniqueIds.filter((id) => {
      const row = byId.get(id);
      if (!row) return false;
      if (input.action === "restore") return row.deletedAt !== null;
      if (input.action === "delete") return true; // findManyByIds already excluded trashed rows
      // status/assign never touch a converted (Client) prospect.
      return row.status !== "Client";
    });

    await withTransaction(async (tx) => {
      for (const id of eligible) {
        const row = byId.get(id)!;
        switch (input.action) {
          case "delete":
            await prospectRepository.softDelete(id, user.id, tx);
            break;
          case "restore":
            await prospectRepository.restore(id, tx);
            break;
          case "status":
            await prospectRepository.update(id, { status: input.value }, tx);
            break;
          case "assign":
            await prospectRepository.update(id, { ownerId: input.value }, tx);
            break;
        }
        await writeAudit(tx, {
          entity: "prospect",
          entityId: id,
          actor: user.id,
          action: `bulk_${input.action}`,
          before: { status: row.status, deletedAt: row.deletedAt },
          after: { value: "value" in input ? input.value : null },
        });
      }
    });

    return { affected: eligible.length, skipped: uniqueIds.length - eligible.length };
  },
};
