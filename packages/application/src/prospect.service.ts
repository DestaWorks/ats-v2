import { canEditProspect, canManageContacts } from "@destaworks/domain/rules/prospect-lifecycle";
import { specialtyTaxonomyQuery, type ProspectStatus } from "@destaworks/domain/constants";
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
} from "@destaworks/contracts/validation/prospect";
import { toIso, isoOrNull } from "@destaworks/domain/utils/iso";
import { defined } from "@destaworks/domain/utils/defined";
import { pageMeta } from "@destaworks/domain/pagination";
import type { TenantContext } from "@destaworks/domain/tenant";
import { writeAudit, writeAuditMany } from "@destaworks/db/audit";
import { withTenantTransaction } from "@destaworks/db/with-transaction";
import {
  prospectRepository,
  type ProspectRow,
} from "@destaworks/db/repositories/prospect.repository";
import {
  prospectContactRepository,
  type ProspectContactRow,
} from "@destaworks/db/repositories/prospect-contact.repository";
import { userRepository } from "@destaworks/db/repositories/user.repository";
import { searchNppes } from "@destaworks/integrations/nppes";
import { findApolloContacts } from "@destaworks/integrations/apollo";
import { findHunterContacts } from "@destaworks/integrations/hunter";
import { checkRateLimit } from "@destaworks/integrations/http/rate-limit";
import { AppError } from "@destaworks/integrations/http/app-error";

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

async function toProspectDetail(ctx: TenantContext, row: ProspectRow): Promise<ProspectDetailDTO> {
  const [contacts, ownerNames] = await Promise.all([
    prospectContactRepository.listByProspect(ctx, row.id),
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

/**
 * The single column patch a bulk action applies to every eligible row. Naming it here is what lets
 * the action run as one `updateMany` instead of a switch inside a per-row loop.
 */
function bulkPatch(input: BulkProspectActionInput, actorId: string) {
  switch (input.action) {
    case "delete":
      return { deletedAt: new Date(), deletedById: actorId };
    case "restore":
      return { deletedAt: null, deletedById: null };
    case "status":
      return { status: input.value };
    case "assign":
      return { ownerId: input.value };
  }
}

/** Load a live prospect or throw NOT_FOUND (missing OR soft-deleted). */
async function requireProspect(ctx: TenantContext, id: string): Promise<ProspectRow> {
  const prospect = await prospectRepository.findById(ctx, id);
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
  ctx: TenantContext,
): Promise<void> {
  await withTenantTransaction(ctx, async (tx) => {
    if (found.length > 0) {
      await prospectContactRepository.createMany(
        ctx,
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
      actor: ctx.user.id,
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
  async search(query: SearchProspectsQuery, ctx: TenantContext): Promise<ProspectSearchResultDTO> {
    await checkRateLimit(`client-discovery-search:${ctx.user.id}`, {
      limit: 20,
      windowMs: 60_000,
    });

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
    const tracked = await prospectRepository.findManyByNpis(ctx, npis);
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
    ctx: TenantContext,
  ): Promise<{ added: number; skipped: number }> {
    await checkRateLimit(`prospect-bulk-add:${ctx.user.id}`, { limit: 10, windowMs: 60_000 });

    const npis = input.rows.map((r) => r.npi);
    const tracked = await prospectRepository.findManyByNpis(ctx, npis);
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
    const { count: added } = await withTenantTransaction(ctx, async (tx) => {
      const result = await prospectRepository.createMany(
        ctx,
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
          createdById: ctx.user.id,
        })),
        tx,
      );
      await writeAudit(tx, {
        entity: "prospect",
        entityId: "bulk",
        actor: ctx.user.id,
        action: "add_from_search",
        after: { count: result.count, source: "NPPES Search" },
      });
      return result;
    });

    return { added, skipped: input.rows.length - added };
  },

  /** Add a prospect manually. Starts at "Fresh Lead" / source "Manual" (the service forces both). */
  async create(input: AddProspectInput, ctx: TenantContext): Promise<ProspectDetailDTO> {
    const prospect = await withTenantTransaction(ctx, async (tx) => {
      const created = await prospectRepository.create(
        ctx,
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
          createdById: ctx.user.id,
        },
        tx,
      );
      await writeAudit(tx, {
        entity: "prospect",
        entityId: created.id,
        actor: ctx.user.id,
        action: "create",
        after: { status: created.status, source: created.source },
      });
      return created;
    });
    return toProspectDetail(ctx, prospect);
  },

  /** The `/client-discovery` inventory — one server OFFSET page (Newest-first). */
  async list(filters: ProspectListFilters, ctx: TenantContext): Promise<ProspectListDTO> {
    const repoFilters = defined({
      status: filters.status,
      ownerId: filters.ownerId,
      source: filters.source,
      search: filters.search,
      includeDeleted: filters.includeDeleted,
    });
    const total = await prospectRepository.count(ctx, repoFilters);
    const meta = pageMeta(total, filters.page ?? 1, LIST_PAGE);
    const rows = await prospectRepository.list(ctx, {
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
  async detail(id: string, ctx: TenantContext): Promise<ProspectDetailDTO> {
    const prospect = await prospectRepository.findById(ctx, id, { includeDeleted: true });
    if (!prospect) throw new AppError("NOT_FOUND", "Prospect not found");
    return toProspectDetail(ctx, prospect);
  },

  /** Edit a prospect (status/owner/notes/website). Guard `canEditProspect` (a converted "Client"
   *  prospect is terminal → CONFLICT). */
  async update(
    id: string,
    input: UpdateProspectInput,
    ctx: TenantContext,
  ): Promise<ProspectDetailDTO> {
    const existing = await requireProspect(ctx, id);
    if (!canEditProspect(existing.status as ProspectStatus)) {
      throw new AppError("CONFLICT", "Prospect already converted to a client");
    }
    const prospect = await withTenantTransaction(ctx, async (tx) => {
      const updated = await prospectRepository.update(
        ctx,
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
        actor: ctx.user.id,
        action: "update",
        before: { status: existing.status, ownerId: existing.ownerId },
        after: { status: updated.status, ownerId: updated.ownerId },
      });
      return updated;
    });
    return toProspectDetail(ctx, prospect);
  },

  /** Enrich a prospect's contacts via Apollo (by practice name + website domain). Rate-limited —
   *  real external-API cost. Guard `canManageContacts` (a converted "Client" is terminal). */
  async enrichContacts(id: string, ctx: TenantContext): Promise<ProspectDetailDTO> {
    const existing = await requireProspect(ctx, id);
    if (!canManageContacts(existing.status as ProspectStatus)) {
      throw new AppError("CONFLICT", "Prospect already converted to a client");
    }
    await checkRateLimit(`client-discovery-enrich:${ctx.user.id}`, {
      limit: 20,
      windowMs: 60_000,
    });

    const domain = extractDomain(existing.website);
    const found = await findApolloContacts({
      organizationName: existing.practiceName,
      ...(domain !== null && { domain }),
    });
    await persistFoundContacts(id, found, "Apollo", "enrich_apollo", ctx);
    return toProspectDetail(ctx, existing);
  },

  /** Hunter.io fallback when Apollo has no result — needs the prospect's website domain. */
  async findContactsHunter(id: string, ctx: TenantContext): Promise<ProspectDetailDTO> {
    const existing = await requireProspect(ctx, id);
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
    await checkRateLimit(`client-discovery-enrich:${ctx.user.id}`, {
      limit: 20,
      windowMs: 60_000,
    });

    const found = await findHunterContacts({ domain });
    await persistFoundContacts(id, found, "Hunter", "enrich_hunter", ctx);
    return toProspectDetail(ctx, existing);
  },

  /** Add a contact manually. Guard `canManageContacts` (a converted "Client" is terminal). */
  async addContactManual(
    id: string,
    input: AddProspectContactInput,
    ctx: TenantContext,
  ): Promise<ProspectDetailDTO> {
    const existing = await requireProspect(ctx, id);
    if (!canManageContacts(existing.status as ProspectStatus)) {
      throw new AppError("CONFLICT", "Prospect already converted to a client");
    }
    await withTenantTransaction(ctx, async (tx) => {
      const created = await prospectContactRepository.create(
        ctx,
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
        actor: ctx.user.id,
        action: "add_contact_manual",
        after: { contactId: created.id, fullName: created.fullName },
      });
    });
    return toProspectDetail(ctx, existing);
  },

  /** Delete one contact, scoped to its prospect. An id under a different prospect → NOT_FOUND. */
  async deleteContact(
    id: string,
    contactId: string,
    ctx: TenantContext,
  ): Promise<ProspectDetailDTO> {
    const existing = await requireProspect(ctx, id);
    await withTenantTransaction(ctx, async (tx) => {
      const count = await prospectContactRepository.softDelete(ctx, id, contactId, tx);
      if (count === 0) throw new AppError("NOT_FOUND", "Contact not found");
      await writeAudit(tx, {
        entity: "prospect",
        entityId: id,
        actor: ctx.user.id,
        action: "delete_contact",
        after: { contactId },
      });
    });
    return toProspectDetail(ctx, existing);
  },

  /** Soft-delete a prospect → reversible trash. */
  async softDelete(id: string, ctx: TenantContext): Promise<{ id: string }> {
    await requireProspect(ctx, id);
    await withTenantTransaction(ctx, async (tx) => {
      const deleted = await prospectRepository.softDelete(ctx, id, ctx.user.id, tx);
      await writeAudit(tx, {
        entity: "prospect",
        entityId: id,
        actor: ctx.user.id,
        action: "delete",
        before: { deletedAt: null },
        after: { deletedAt: deleted.deletedAt, deletedById: ctx.user.id },
      });
    });
    return { id };
  },

  /** Restore a soft-deleted prospect — returns EXACTLY as it was (status untouched). */
  async restore(id: string, ctx: TenantContext): Promise<ProspectDetailDTO> {
    const existing = await prospectRepository.findById(ctx, id, { includeDeleted: true });
    if (!existing) throw new AppError("NOT_FOUND", "Prospect not found");
    if (existing.deletedAt === null) throw new AppError("CONFLICT", "Prospect is not deleted");
    const restored = await withTenantTransaction(ctx, async (tx) => {
      const prospect = await prospectRepository.restore(ctx, id, tx);
      await writeAudit(tx, {
        entity: "prospect",
        entityId: id,
        actor: ctx.user.id,
        action: "restore",
        before: { deletedAt: existing.deletedAt, deletedById: existing.deletedById },
        after: { deletedAt: null, status: prospect.status },
      });
      return prospect;
    });
    return toProspectDetail(ctx, restored);
  },

  /**
   * Bulk actions (delete/restore/status/assign). Resolves the working set server-side, SKIPS rows
   * the action can't apply to (a converted "Client" for status/assign), applies the rest in ONE
   * transaction — one `updateMany` and one audit insert, not a pair per row — and reports
   * `{ affected, skipped }` honestly.
   */
  async bulkAction(
    input: BulkProspectActionInput,
    ctx: TenantContext,
  ): Promise<{ affected: number; skipped: number }> {
    const uniqueIds = [...new Set(input.ids)];
    const rows = await prospectRepository.findManyByIds(ctx, uniqueIds, {
      includeDeleted: input.action === "restore",
    });
    const byId = new Map(rows.map((r) => [r.id, r]));

    if (input.action === "assign") {
      const names = await userRepository.namesByIds([input.value]);
      if (!names.has(input.value)) throw new AppError("NOT_FOUND", "User not found");
    }

    const eligible = uniqueIds.flatMap((id) => {
      const row = byId.get(id);
      if (!row) return [];
      if (input.action === "restore") return row.deletedAt !== null ? [row] : [];
      if (input.action === "delete") return [row]; // findManyByIds already excluded trashed rows
      // status/assign never touch a converted (Client) prospect.
      return row.status !== "Client" ? [row] : [];
    });

    if (eligible.length > 0) {
      await withTenantTransaction(ctx, async (tx) => {
        await prospectRepository.bulkUpdate(
          ctx,
          eligible.map((row) => row.id),
          bulkPatch(input, ctx.user.id),
          tx,
        );
        await writeAuditMany(
          tx,
          eligible.map((row) => ({
            entity: "prospect",
            entityId: row.id,
            actor: ctx.user.id,
            action: `bulk_${input.action}`,
            before: { status: row.status, deletedAt: row.deletedAt },
            after: { value: "value" in input ? input.value : null },
          })),
        );
      });
    }

    return { affected: eligible.length, skipped: uniqueIds.length - eligible.length };
  },
};
