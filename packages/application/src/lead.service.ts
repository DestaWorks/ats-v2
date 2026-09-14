import { Prisma } from "@destaworks/db/generated/prisma/client";
import { normalizeLeadStatus } from "@destaworks/domain/rules/normalize-lead-status";
import {
  advanceOnOutreach,
  canLogOutreach,
  canPromote,
  canRespond,
  setResponse,
} from "@destaworks/domain/rules/lead-lifecycle";
import type { LeadStatus, OutreachChannel } from "@destaworks/domain/constants";
import type {
  BulkLeadActionInput,
  CreateLeadInput,
  ImportLeadsInput,
  LeadDetailDTO,
  LeadListDTO,
  LeadListItemDTO,
  LogOutreachInput,
  OutreachAttemptDTO,
  UpdateOutreachInput,
} from "@destaworks/contracts/validation/lead";
import { toIso, isoOrNull } from "@destaworks/domain/utils/iso";
import { defined } from "@destaworks/domain/utils/defined";
import { pageMeta } from "@destaworks/domain/pagination";
import type { TenantContext } from "@destaworks/domain/tenant";
import { writeAudit, writeAuditMany } from "@destaworks/db/audit";
import { withTenantTransaction } from "@destaworks/db/with-transaction";
import {
  leadRepository,
  type LeadRow,
  type OutreachRow,
} from "@destaworks/db/repositories/lead.repository";
import { clientRepository } from "@destaworks/db/repositories/client.repository";
import { userRepository } from "@destaworks/db/repositories/user.repository";
import { AppError } from "@destaworks/integrations/http/app-error";
import { candidateService } from "./candidate.service";
import { leadToCandidateInput } from "./lead.promote-map";
import { cachedClientNameMap } from "@destaworks/integrations/http/request-cache";

/** One OFFSET page of the `/sourcing` inventory (matches the candidate `LIST_PAGE`). */
const LIST_PAGE = 25;

/** Filters accepted by the `/sourcing` list read — status/source/client/owner/search + a page. */
export interface LeadListFilters {
  status?: string;
  source?: string;
  clientId?: string;
  /** Owner filter — who sourced the lead (`createdById`). */
  ownerId?: string;
  search?: string;
  /** "Show deleted" — include soft-deleted rows (they render flagged, with Restore). */
  includeDeleted?: boolean;
  /** 1-based OFFSET page (clamped to `[1, totalPages]`). */
  page?: number;
}

/** Project a lead row onto the inventory row DTO. Names come from the batch client/user maps. */
function toLeadListItem(
  row: LeadRow,
  clientNames: Map<string, string>,
  ownerNames: Map<string, string>,
): LeadListItemDTO {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    credential: row.credential,
    state: row.state,
    source: row.source,
    status: row.status as LeadStatus,
    outreachCount: row.outreachCount,
    lastOutreachAt: isoOrNull(row.lastOutreachAt),
    lastOutreachChannel: row.lastOutreachChannel,
    targetClientName: row.clientId ? (clientNames.get(row.clientId) ?? null) : null,
    ownerName: row.createdById ? (ownerNames.get(row.createdById) ?? null) : null,
    promotedCandidateId: row.promotedCandidateId,
    createdAt: toIso(row.createdAt),
    deletedAt: isoOrNull(row.deletedAt),
    snoozedUntil: isoOrNull(row.snoozedUntil),
  };
}

/** Project one outreach attempt; `actorName` from the batch user-name map (null if unknown). */
function toOutreachAttemptDTO(
  row: OutreachRow,
  actorNames: Map<string, string>,
): OutreachAttemptDTO {
  return {
    id: row.id,
    channel: row.channel as OutreachChannel,
    at: toIso(row.at),
    note: row.note,
    actorId: row.actorId,
    actorName: actorNames.get(row.actorId) ?? null,
  };
}

/** Project a full lead detail — the list item + sourcing context + the (newest-first) attempt log. */
function toLeadDetail(
  row: LeadRow,
  attempts: OutreachRow[],
  clientNames: Map<string, string>,
  actorNames: Map<string, string>,
): LeadDetailDTO {
  return {
    // `actorNames` was batched over the attempts' actors PLUS the lead's owner (loadDetail).
    ...toLeadListItem(row, clientNames, actorNames),
    linkedinUrl: row.linkedinUrl,
    tags: row.tags,
    notes: row.notes,
    respondedAt: isoOrNull(row.respondedAt),
    targetClientId: row.clientId,
    attempts: attempts.map((a) => toOutreachAttemptDTO(a, actorNames)),
  };
}

/**
 * Compose a lead's `LeadDetailDTO` — loads its attempts + resolves the target-client name (one-shot
 * client map, as the candidate reads do) and attempt actor names via a SINGLE batched
 * `userRepository.namesByIds` (no N+1). Used to return the fresh detail after every mutation.
 */
async function loadDetail(ctx: TenantContext, lead: LeadRow): Promise<LeadDetailDTO> {
  const [attempts, clientNames] = await Promise.all([
    leadRepository.listOutreach(ctx, lead.id),
    clientRepository.nameMap(ctx),
  ]);
  const actorNames = await userRepository.namesByIds([
    ...attempts.map((a) => a.actorId),
    ...(lead.createdById ? [lead.createdById] : []),
  ]);
  return toLeadDetail(lead, attempts, clientNames, actorNames);
}

/**
 * The single column patch a bulk action applies to every eligible row. Naming it here is what lets
 * the action run as one `updateMany` instead of a switch inside a per-row loop. `outreach` is
 * absent deliberately — it is not a uniform patch, and its caller handles it separately.
 */
function bulkPatch(input: Exclude<BulkLeadActionInput, { action: "outreach" }>, actorId: string) {
  switch (input.action) {
    case "delete":
      return { deletedAt: new Date(), deletedById: actorId };
    case "restore":
      return { deletedAt: null, deletedById: null };
    case "status":
      return { status: normalizeLeadStatus(input.value) };
    case "assign":
      return { createdById: input.value };
    case "client":
      return { clientId: input.value };
  }
}

/** Load a live lead or throw NOT_FOUND (missing OR soft-deleted — `findById` excludes trashed rows). */
async function requireLead(ctx: TenantContext, id: string): Promise<LeadRow> {
  const lead = await leadRepository.findById(ctx, id);
  if (!lead) throw new AppError("NOT_FOUND", "Lead not found");
  return lead;
}

/**
 * Source-lead business logic (Wave 2.6). Owns authZ + the DTO shape + the state-machine writes; never
 * touches Prisma directly. AUTHZ (L-7): every lead action is open to any signed-in operator — the
 * ROUTES `requireUser()` and forward the authed `user`; there is no lead-specific capability in v1.
 * The pure `lead-lifecycle` rules are the sole source of the next legal status; the service is the
 * sole WRITER and adds the row-level guards (not-found / soft-deleted / already-promoted).
 */
export const leadService = {
  /**
   * Add a lead. Starts at "Sourced" (a create can't drop a lead mid-funnel — no `status` on the
   * body); `outreachCount: 0`; `createdById = user.id`. The insert + a `create` audit run in one
   * transaction so the trail can't drift. Returns the fresh detail (empty attempt log).
   */
  async create(input: CreateLeadInput, ctx: TenantContext): Promise<LeadDetailDTO> {
    const lead = await withTenantTransaction(ctx, async (tx) => {
      const created = await leadRepository.create(
        ctx,
        {
          name: input.name,
          email: input.email ?? null,
          phone: input.phone ?? null,
          linkedinUrl: input.linkedinUrl ?? null,
          credential: input.credential ?? null,
          state: input.state ?? null,
          source: input.source ?? null,
          tags: input.tags ?? [],
          notes: input.notes ?? null,
          clientId: input.clientId ?? null,
          // Canonical default (validated vs LEAD_STATUSES); normalizeLeadStatus is the ETL/import path.
          status: normalizeLeadStatus("Sourced"),
          outreachCount: 0,
          createdById: ctx.user.id,
        },
        tx,
      );
      await writeAudit(tx, {
        entity: "source_lead",
        entityId: created.id,
        actor: ctx.user.id,
        action: "create",
        after: { status: created.status, source: created.source },
      });
      return created;
    });
    return loadDetail(ctx, lead);
  },

  /**
   * The `/sourcing` inventory — one server OFFSET page (Newest-first), mirroring the candidates
   * list: true filtered `total`, `page` clamped to `[1, totalPages]`, `hasPrev`/`hasNext` for the
   * numbered pager. `targetClientName`/`ownerName` resolve from one-shot batch maps (no N+1).
   */
  async list(filters: LeadListFilters, ctx: TenantContext): Promise<LeadListDTO> {
    const repoFilters = defined({
      status: filters.status,
      source: filters.source,
      clientId: filters.clientId,
      createdById: filters.ownerId,
      search: filters.search,
      includeDeleted: filters.includeDeleted,
    });
    const [total, clientNames] = await Promise.all([
      leadRepository.count(ctx, repoFilters),
      cachedClientNameMap(ctx),
    ]);
    const meta = pageMeta(total, filters.page ?? 1, LIST_PAGE);
    const rows = await leadRepository.list(ctx, {
      ...repoFilters,
      skip: (meta.page - 1) * LIST_PAGE,
      take: LIST_PAGE,
    });
    // Owner display names in ONE batched read (legacy Owner column).
    const ownerNames = await userRepository.namesByIds(
      rows.map((r) => r.createdById).filter((id): id is string => id !== null),
    );
    const leads = rows.map((row) => toLeadListItem(row, clientNames, ownerNames));
    return { leads, ...meta };
  },

  /**
   * Log an outreach attempt. Guard `canLogOutreach` (a Promoted lead is handed off → CONFLICT). In
   * ONE transaction: insert the attempt, advance the status via `advanceOnOutreach` (caps at Outreach
   * 3; HELD for a responded lead — the attempt still counts), bump `outreachCount`/`lastOutreachAt`,
   * and audit `log_outreach`. Returns the fresh detail (new status/count + the appended attempt).
   */
  async logOutreach(
    id: string,
    input: LogOutreachInput,
    ctx: TenantContext,
  ): Promise<LeadDetailDTO> {
    const existing = await requireLead(ctx, id);
    const status = existing.status as LeadStatus;
    if (!canLogOutreach(status)) throw new AppError("CONFLICT", "Lead already promoted");
    const at = input.at ?? new Date();
    const next = advanceOnOutreach(status);
    const lead = await withTenantTransaction(ctx, async (tx) => {
      const { lead: updated } = await leadRepository.logOutreach(
        ctx,
        {
          leadId: id,
          channel: input.channel,
          ...(input.note !== undefined && { note: input.note }),
          at,
          actorId: ctx.user.id,
          status: next,
          ...(input.templateId !== undefined && { templateId: input.templateId }),
        },
        tx,
      );
      await writeAudit(tx, {
        entity: "source_lead",
        entityId: id,
        actor: ctx.user.id,
        action: "log_outreach",
        before: { status, outreachCount: existing.outreachCount },
        after: { status: next, channel: input.channel },
      });
      return updated;
    });
    return loadDetail(ctx, lead);
  },

  /**
   * Mark a lead Responded (Hot/Cold). Guard `canRespond` (Promoted → CONFLICT). Sets the responded
   * status + stamps `respondedAt` the FIRST time (re-settable Hot↔Cold keeps the original timestamp),
   * audited `respond`, in one transaction. Returns the fresh detail.
   *
   * Wave 4.1 (Templates) — also auto-backfills `response`/`respondedAt` on the most recent
   * outreach attempt for this lead that doesn't have one yet (if any), so Template Performance
   * gets response-rate data without requiring a separate manual "mark responded" step (legacy
   * required a fully manual edit for this — see `docs/IMPLEMENTATION-PLAN.md` Wave 4.1 notes).
   * Scoped to attempts with `response: null`, so a later `respond()` call never re-touches an
   * attempt that was already backfilled or manually set.
   */
  async respond(id: string, kind: "hot" | "cold", ctx: TenantContext): Promise<LeadDetailDTO> {
    const existing = await requireLead(ctx, id);
    const status = existing.status as LeadStatus;
    if (!canRespond(status)) throw new AppError("CONFLICT", "Lead already promoted");
    const next = setResponse(kind === "hot" ? "Hot" : "Cold");
    const respondedAt = new Date();
    const lead = await withTenantTransaction(ctx, async (tx) => {
      const updated = await leadRepository.update(
        ctx,
        id,
        { status: next, respondedAt: existing.respondedAt ?? respondedAt },
        tx,
      );
      const lastAttempt = await leadRepository.findMostRecentUnresponded(ctx, id, tx);
      if (lastAttempt) {
        await leadRepository.updateOutreachAttempt(
          ctx,
          id,
          lastAttempt.id,
          { response: kind, respondedAt },
          tx,
        );
      }
      await writeAudit(tx, {
        entity: "source_lead",
        entityId: id,
        actor: ctx.user.id,
        action: "respond",
        before: { status },
        after: { status: next },
      });
      return updated;
    });
    return loadDetail(ctx, lead);
  },

  /**
   * Promote a lead into the candidate pipeline (L-5). Terminal + idempotent-guarded: a missing/
   * soft-deleted lead → NOT_FOUND, an already-Promoted lead → CONFLICT (the `canPromote` pre-check
   * catches the sequential case; a status-guarded conditional flip INSIDE the tx catches the
   * concurrent race — see below). In ONE transaction: create the candidate via
   * the COMPOSED `candidateService.create` (forced to NEW_CANDIDATE / stage 0, `createdById = user`,
   * fields COERCED by `leadToCandidateInput`), flip the lead to Promoted + set `promotedCandidateId`,
   * and audit `promote` — atomic, so a lead can never read Promoted while pointing at a candidate that
   * failed to write. Returns the new candidate id (the client navigates to `/candidates/{id}`).
   * `opts.filledFromRoleId` (Wave 3.5, `openRoleService.promote`) stamps which Open Role this
   * candidate fills — a real FK, unlike legacy's `"FilledFromRole:R123"` tags-string hack.
   */
  async promote(
    id: string,
    ctx: TenantContext,
    opts?: { filledFromRoleId?: string },
  ): Promise<{ candidateId: string }> {
    const existing = await requireLead(ctx, id);
    if (!canPromote(existing.status as LeadStatus)) {
      throw new AppError("CONFLICT", "Lead already promoted");
    }
    const input = {
      ...leadToCandidateInput(existing),
      filledFromRoleId: opts?.filledFromRoleId ?? null,
    };
    return withTenantTransaction(ctx, async (tx) => {
      const candidate = await candidateService.create(input, { user: ctx, tx });
      // Guarded flip INSIDE the tx: if a concurrent promote already flipped this lead, we update 0
      // rows → throw CONFLICT, which rolls back the candidate we just created (no orphan candidate).
      const flipped = await leadRepository.markPromoted(ctx, id, candidate.id, tx);
      if (flipped !== 1) {
        throw new AppError("CONFLICT", "Lead already promoted");
      }
      await writeAudit(tx, {
        entity: "source_lead",
        entityId: id,
        actor: ctx.user.id,
        action: "promote",
        before: { status: existing.status },
        after: { status: "Promoted", candidateId: candidate.id },
      });
      return { candidateId: candidate.id };
    });
  },

  /**
   * Soft-delete a lead → reversible trash. `requireLead` (excludes already-trashed rows) is the
   * existence/idempotency guard — a missing OR already-trashed lead → NOT_FOUND. The repo `softDelete`
   * + a `delete` audit run in one transaction. Returns `{ id }` (never echoes lead PII).
   */
  async softDelete(id: string, ctx: TenantContext): Promise<{ id: string }> {
    const existing = await requireLead(ctx, id);
    await withTenantTransaction(ctx, async (tx) => {
      const deleted = await leadRepository.softDelete(ctx, id, ctx.user.id, tx);
      await writeAudit(tx, {
        entity: "source_lead",
        entityId: id,
        actor: ctx.user.id,
        action: "delete",
        before: { deletedAt: null },
        after: { deletedAt: deleted.deletedAt, deletedById: ctx.user.id, status: existing.status },
      });
    });
    return { id };
  },

  /**
   * Restore a soft-deleted lead — mirrors `candidateService.restore`: the lead returns EXACTLY as
   * it was (status/outreach untouched; only the delete markers clear). A missing lead → NOT_FOUND;
   * a live (not-deleted) lead → CONFLICT. Repo `restore` + a `restore` audit in one transaction.
   */
  async restore(id: string, ctx: TenantContext): Promise<LeadDetailDTO> {
    const existing = await leadRepository.findById(ctx, id, { includeDeleted: true });
    if (!existing) throw new AppError("NOT_FOUND", "Lead not found");
    if (existing.deletedAt === null) throw new AppError("CONFLICT", "Lead is not deleted");
    const restored = await withTenantTransaction(ctx, async (tx) => {
      const lead = await leadRepository.restore(ctx, id, tx);
      await writeAudit(tx, {
        entity: "source_lead",
        entityId: id,
        actor: ctx.user.id,
        action: "restore",
        before: { deletedAt: existing.deletedAt, deletedById: existing.deletedById },
        after: { deletedAt: null, status: lead.status },
      });
      return lead;
    });
    return loadDetail(ctx, restored);
  },

  /** One lead's full detail (incl. soft-deleted — the "Show deleted" view inspects them too). */
  async detail(id: string, ctx: TenantContext): Promise<LeadDetailDTO> {
    const lead = await leadRepository.findById(ctx, id, { includeDeleted: true });
    if (!lead) throw new AppError("NOT_FOUND", "Lead not found");
    return loadDetail(ctx, lead);
  },

  /**
   * Snooze (`until` a date) or wake (`until: null`) a lead — `source_lead_snooze` parity. A
   * FUTURE snooze excludes the lead from stuck-lead alerts; consumers must be date-aware (the
   * legacy brief treated any non-empty value as snoozed forever — that bug stops here). A
   * Promoted lead can't be snoozed (its lifecycle is closed). Audited `snooze`/`wake`.
   */
  async snooze(id: string, until: Date | null, ctx: TenantContext): Promise<LeadDetailDTO> {
    const existing = await requireLead(ctx, id);
    if (until && existing.status === "Promoted") {
      throw new AppError("CONFLICT", "Lead already promoted");
    }
    const lead = await withTenantTransaction(ctx, async (tx) => {
      const updated = await leadRepository.update(ctx, id, { snoozedUntil: until }, tx);
      await writeAudit(tx, {
        entity: "source_lead",
        entityId: id,
        actor: ctx.user.id,
        action: until ? "snooze" : "wake",
        before: { snoozedUntil: existing.snoozedUntil },
        after: { snoozedUntil: until },
      });
      return updated;
    });
    return loadDetail(ctx, lead);
  },

  /**
   * Edit one logged attempt (`source_lead_edit_outreach` parity — legacy had NO role gate; any
   * operator may edit, every edit audited). Editing NEVER touches the lead's status (legacy hid
   * the status selector on edit); the denormalized `lastOutreachAt` is re-synced when `at`
   * changed. An attempt id under a different lead → NOT_FOUND (the repo scopes the write).
   */
  async updateOutreach(
    id: string,
    attemptId: string,
    input: UpdateOutreachInput,
    ctx: TenantContext,
  ): Promise<LeadDetailDTO> {
    await requireLead(ctx, id);
    const lead = await withTenantTransaction(ctx, async (tx) => {
      const count = await leadRepository.updateOutreachAttempt(
        ctx,
        id,
        attemptId,
        {
          ...(input.channel !== undefined ? { channel: input.channel } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
          ...(input.at !== undefined ? { at: input.at } : {}),
          ...(input.response !== undefined ? { response: input.response } : {}),
          ...(input.respondedAt !== undefined ? { respondedAt: input.respondedAt } : {}),
        },
        tx,
      );
      if (count === 0) throw new AppError("NOT_FOUND", "Outreach attempt not found");
      const synced = await leadRepository.syncOutreachDenorm(ctx, id, tx);
      await writeAudit(tx, {
        entity: "source_lead",
        entityId: id,
        actor: ctx.user.id,
        action: "edit_outreach",
        after: { attemptId, ...input },
      });
      return synced;
    });
    return loadDetail(ctx, lead);
  },

  /**
   * Delete one logged attempt (`source_lead_delete_outreach` parity — no role gate, audited).
   * The denormalized count/lastOutreachAt re-sync from the table; the lead's STATUS is NOT
   * regressed (legacy parity — un-advancing the funnel stays a manual status change).
   */
  async deleteOutreach(id: string, attemptId: string, ctx: TenantContext): Promise<LeadDetailDTO> {
    await requireLead(ctx, id);
    const lead = await withTenantTransaction(ctx, async (tx) => {
      const count = await leadRepository.deleteOutreachAttempt(ctx, id, attemptId, tx);
      if (count === 0) throw new AppError("NOT_FOUND", "Outreach attempt not found");
      const synced = await leadRepository.syncOutreachDenorm(ctx, id, tx);
      await writeAudit(tx, {
        entity: "source_lead",
        entityId: id,
        actor: ctx.user.id,
        action: "delete_outreach",
        after: { attemptId },
      });
      return synced;
    });
    return loadDetail(ctx, lead);
  },

  /**
   * Bulk actions (`source_lead_bulk_action` + `source_lead_undelete` + bulk-log parity, one
   * dispatcher). Resolves the working set server-side, SKIPS rows the action can't apply to
   * (Promoted leads for status/client/outreach; wrong delete-state rows), applies the rest in
   * ONE transaction with a per-lead audit row, and reports `{ affected, skipped }` honestly.
   * `assign` re-points `createdById` (the ownership column every "mine"/owner filter keys off).
   */
  async bulkAction(
    input: BulkLeadActionInput,
    ctx: TenantContext,
  ): Promise<{ affected: number; skipped: number }> {
    const uniqueIds = [...new Set(input.ids)];
    const rows = await leadRepository.findManyByIds(ctx, uniqueIds, {
      includeDeleted: input.action === "restore",
    });
    const byId = new Map(rows.map((r) => [r.id, r]));

    // Validate cross-entity references ONCE, outside the loop.
    if (input.action === "assign") {
      const names = await userRepository.namesByIds([input.value]);
      if (!names.has(input.value)) throw new AppError("NOT_FOUND", "User not found");
    }
    if (input.action === "client" && input.value !== null) {
      const clients = await clientRepository.list(ctx);
      if (!clients.some((c) => c.id === input.value)) {
        throw new AppError("NOT_FOUND", "Client not found");
      }
    }

    const eligible = uniqueIds.flatMap((id) => {
      const row = byId.get(id);
      if (!row) return [];
      if (input.action === "restore") return row.deletedAt !== null ? [row] : [];
      if (input.action === "delete") return [row]; // findManyByIds already excluded trashed rows
      if (input.action === "assign") return [row];
      // status/client/outreach never touch a closed (Promoted) lead.
      return row.status !== "Promoted" ? [row] : [];
    });

    if (eligible.length > 0) {
      await withTenantTransaction(ctx, async (tx) => {
        if (input.action === "outreach") {
          // The one action that stays per row: each lead advances from ITS OWN status, and the
          // attempt insert has to carry the lead it belongs to.
          const at = new Date();
          for (const row of eligible) {
            await leadRepository.logOutreach(
              ctx,
              {
                leadId: row.id,
                channel: input.channel,
                note: input.note ?? null,
                at,
                actorId: ctx.user.id,
                status: advanceOnOutreach(row.status as LeadStatus),
              },
              tx,
            );
          }
        } else {
          await leadRepository.bulkUpdate(
            ctx,
            eligible.map((row) => row.id),
            bulkPatch(input, ctx.user.id),
            tx,
          );
        }
        await writeAuditMany(
          tx,
          eligible.map((row) => ({
            entity: "source_lead",
            entityId: row.id,
            actor: ctx.user.id,
            action: `bulk_${input.action}`,
            before: { status: row.status, deletedAt: row.deletedAt },
            after:
              input.action === "outreach"
                ? { channel: input.channel }
                : { value: "value" in input ? input.value : null },
          })),
        );
      });
    }

    return { affected: eligible.length, skipped: uniqueIds.length - eligible.length };
  },

  /**
   * Import one chunk of leads (`source_lead_bulk_import` parity — the client sends ≤200-row
   * chunks sequentially). Dedup is SERVER-side (the legacy client trusted the backend too):
   * a row is a duplicate if its lowercased email matches an existing lead (or an earlier row in
   * the batch), or — for email-less rows — its name matches case-insensitively. `clientName`
   * resolves to a client id case-insensitively (unknown names → no client). Every kept row
   * starts with `createdById = importer` and its (already-validated) status, default "Sourced".
   * One `bulk_import` audit row records the counts.
   *
   * Rows carrying `priorOutreachNotes` (legacy "Outreach - <Rep>" columns) backfill outreach-
   * attempt rows too — inserted individually (not via `createMany`, which can't return per-row
   * ids to attach attempts to) with the resulting count/timestamp already denormalized onto the
   * lead, so this never diverges from what `syncOutreachDenorm` would compute.
   *
   * The pre-check above is defense-in-depth, not the sole guard: `source_leads` has a DB-level
   * case-insensitive unique index on live emails (2026-08-08), so a genuine race — two concurrent
   * imports, or an import racing a manual add, on the same email — can't insert a real duplicate.
   * `createMany` passes `skipDuplicates` for the fast path; the individual-insert path (rows with
   * notes) catches the resulting P2002 and counts that row as skipped instead of throwing.
   */
  async importLeads(
    input: ImportLeadsInput,
    ctx: TenantContext,
  ): Promise<{ added: number; skipped: number }> {
    const emails = input.rows.map((r) => r.email?.toLowerCase()).filter((e): e is string => !!e);
    const namesForEmailless = input.rows
      .filter((r) => !r.email)
      .map((r) => r.name.trim().toLowerCase());
    const [byEmail, byName, clients] = await Promise.all([
      leadRepository.findManyByEmails(ctx, emails),
      leadRepository.findManyByNames(ctx, namesForEmailless),
      clientRepository.list(ctx),
    ]);
    const existingEmails = new Set(
      byEmail.flatMap((l) => (l.email === null ? [] : [l.email.toLowerCase()])),
    );
    const existingNames = new Set(byName.map((l) => l.name.trim().toLowerCase()));
    const clientByName = new Map(clients.map((c) => [c.name.trim().toLowerCase(), c.id]));

    const seen = new Set<string>();
    const kept = input.rows.filter((row) => {
      const key = row.email ? row.email.toLowerCase() : `name:${row.name.trim().toLowerCase()}`;
      if (seen.has(key)) return false; // intra-batch duplicate
      seen.add(key);
      if (row.email) return !existingEmails.has(row.email.toLowerCase());
      return !existingNames.has(row.name.trim().toLowerCase());
    });

    function toCreateInput(row: (typeof kept)[number]) {
      return {
        name: row.name,
        email: row.email ?? null,
        phone: row.phone ?? null,
        linkedinUrl: row.linkedinUrl ?? null,
        credential: row.credential ?? null,
        state: row.state ?? null,
        source: row.source ?? null,
        tags: row.tags ?? [],
        notes: row.notes ?? null,
        clientId: row.clientName
          ? (clientByName.get(row.clientName.trim().toLowerCase()) ?? null)
          : null,
        status: normalizeLeadStatus(row.status ?? "Sourced"),
        createdById: ctx.user.id,
      };
    }

    const withNotes = kept.flatMap((row) => {
      const notes = row.priorOutreachNotes;
      return notes && notes.length > 0 ? [{ row, notes }] : [];
    });
    const withoutNotes = kept.filter(
      (r) => !r.priorOutreachNotes || r.priorOutreachNotes.length === 0,
    );

    const added = await withTenantTransaction(ctx, async (tx) => {
      let insertedCount = 0;
      if (withoutNotes.length > 0) {
        const result = await leadRepository.createMany(
          ctx,
          withoutNotes.map((row) => ({ ...toCreateInput(row), outreachCount: 0 })),
          tx,
          { skipDuplicates: true },
        );
        insertedCount += result.count;
      }
      for (const { row, notes } of withNotes) {
        const at = new Date();
        let lead: { id: string };
        try {
          lead = await leadRepository.create(
            ctx,
            {
              ...toCreateInput(row),
              outreachCount: notes.length,
              lastOutreachAt: at,
              lastOutreachChannel: "linkedin", // legacy hardcoded this channel for folded columns too
            },
            tx,
          );
        } catch (err) {
          // A concurrent request won the race on this row's email since the pre-check above —
          // the unique index rejects it; count it as skipped rather than failing the whole chunk.
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
          throw err;
        }
        insertedCount++;
        await leadRepository.createManyOutreachAttempts(
          ctx,
          notes.map((note) => ({
            leadId: lead.id,
            channel: "linkedin",
            note,
            at,
            actorId: ctx.user.id,
          })),
          tx,
        );
      }
      await writeAudit(tx, {
        entity: "source_lead",
        entityId: "bulk",
        actor: ctx.user.id,
        action: "bulk_import",
        after: { added: insertedCount, skipped: input.rows.length - insertedCount },
      });
      return insertedCount;
    });

    return { added, skipped: input.rows.length - added };
  },
};
