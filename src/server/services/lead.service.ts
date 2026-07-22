import "server-only";
import { normalizeLeadStatus } from "@/lib/rules/normalize-lead-status";
import {
  advanceOnOutreach,
  canLogOutreach,
  canPromote,
  canRespond,
  setResponse,
} from "@/lib/rules/lead-lifecycle";
import type { LeadStatus, OutreachChannel } from "@/lib/constants";
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
} from "@/lib/validation/lead";
import { toIso, isoOrNull } from "@/lib/utils/iso";
import { pageMeta } from "@/lib/pagination";
import type { AuthUser } from "@/server/auth/guards";
import { writeAudit } from "@/server/db/audit";
import { withTransaction } from "@/server/db/with-transaction";
import {
  leadRepository,
  type LeadRow,
  type OutreachRow,
} from "@/server/repositories/lead.repository";
import { clientRepository } from "@/server/repositories/client.repository";
import { userRepository } from "@/server/repositories/user.repository";
import { AppError } from "@/server/http/app-error";
import { candidateService } from "./candidate.service";
import { leadToCandidateInput } from "./lead.promote-map";

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
async function loadDetail(lead: LeadRow): Promise<LeadDetailDTO> {
  const [attempts, clientNames] = await Promise.all([
    leadRepository.listOutreach(lead.id),
    clientRepository.nameMap(),
  ]);
  const actorNames = await userRepository.namesByIds([
    ...attempts.map((a) => a.actorId),
    ...(lead.createdById ? [lead.createdById] : []),
  ]);
  return toLeadDetail(lead, attempts, clientNames, actorNames);
}

/** Load a live lead or throw NOT_FOUND (missing OR soft-deleted — `findById` excludes trashed rows). */
async function requireLead(id: string): Promise<LeadRow> {
  const lead = await leadRepository.findById(id);
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
  async create(input: CreateLeadInput, user: AuthUser): Promise<LeadDetailDTO> {
    const lead = await withTransaction(async (tx) => {
      const created = await leadRepository.create(
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
          createdById: user.id,
        },
        tx,
      );
      await writeAudit(tx, {
        entity: "source_lead",
        entityId: created.id,
        actor: user.id,
        action: "create",
        after: { status: created.status, source: created.source },
      });
      return created;
    });
    return loadDetail(lead);
  },

  /**
   * The `/sourcing` inventory — one server OFFSET page (Newest-first), mirroring the candidates
   * list: true filtered `total`, `page` clamped to `[1, totalPages]`, `hasPrev`/`hasNext` for the
   * numbered pager. `targetClientName`/`ownerName` resolve from one-shot batch maps (no N+1).
   */
  async list(filters: LeadListFilters = {}): Promise<LeadListDTO> {
    const repoFilters = {
      status: filters.status,
      source: filters.source,
      clientId: filters.clientId,
      createdById: filters.ownerId,
      search: filters.search,
      includeDeleted: filters.includeDeleted,
    };
    const [total, clientNames] = await Promise.all([
      leadRepository.count(repoFilters),
      clientRepository.nameMap(),
    ]);
    const meta = pageMeta(total, filters.page ?? 1, LIST_PAGE);
    const rows = await leadRepository.list({
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
  async logOutreach(id: string, input: LogOutreachInput, user: AuthUser): Promise<LeadDetailDTO> {
    const existing = await requireLead(id);
    const status = existing.status as LeadStatus;
    if (!canLogOutreach(status)) throw new AppError("CONFLICT", "Lead already promoted");
    const at = input.at ?? new Date();
    const next = advanceOnOutreach(status);
    const lead = await withTransaction(async (tx) => {
      const { lead: updated } = await leadRepository.logOutreach(
        {
          leadId: id,
          channel: input.channel,
          note: input.note,
          at,
          actorId: user.id,
          status: next,
          templateId: input.templateId,
        },
        tx,
      );
      await writeAudit(tx, {
        entity: "source_lead",
        entityId: id,
        actor: user.id,
        action: "log_outreach",
        before: { status, outreachCount: existing.outreachCount },
        after: { status: next, channel: input.channel },
      });
      return updated;
    });
    return loadDetail(lead);
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
  async respond(id: string, kind: "hot" | "cold", user: AuthUser): Promise<LeadDetailDTO> {
    const existing = await requireLead(id);
    const status = existing.status as LeadStatus;
    if (!canRespond(status)) throw new AppError("CONFLICT", "Lead already promoted");
    const next = setResponse(kind === "hot" ? "Hot" : "Cold");
    const respondedAt = new Date();
    const lead = await withTransaction(async (tx) => {
      const updated = await leadRepository.update(
        id,
        { status: next, respondedAt: existing.respondedAt ?? respondedAt },
        tx,
      );
      const lastAttempt = await leadRepository.findMostRecentUnresponded(id, tx);
      if (lastAttempt) {
        await leadRepository.updateOutreachAttempt(
          id,
          lastAttempt.id,
          { response: kind, respondedAt },
          tx,
        );
      }
      await writeAudit(tx, {
        entity: "source_lead",
        entityId: id,
        actor: user.id,
        action: "respond",
        before: { status },
        after: { status: next },
      });
      return updated;
    });
    return loadDetail(lead);
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
    user: AuthUser,
    opts?: { filledFromRoleId?: string },
  ): Promise<{ candidateId: string }> {
    const existing = await requireLead(id);
    if (!canPromote(existing.status as LeadStatus)) {
      throw new AppError("CONFLICT", "Lead already promoted");
    }
    const input = {
      ...leadToCandidateInput(existing),
      filledFromRoleId: opts?.filledFromRoleId ?? null,
    };
    return withTransaction(async (tx) => {
      const candidate = await candidateService.create(input, { user, tx });
      // Guarded flip INSIDE the tx: if a concurrent promote already flipped this lead, we update 0
      // rows → throw CONFLICT, which rolls back the candidate we just created (no orphan candidate).
      const flipped = await leadRepository.markPromoted(id, candidate.id, tx);
      if (flipped !== 1) {
        throw new AppError("CONFLICT", "Lead already promoted");
      }
      await writeAudit(tx, {
        entity: "source_lead",
        entityId: id,
        actor: user.id,
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
  async softDelete(id: string, user: AuthUser): Promise<{ id: string }> {
    const existing = await requireLead(id);
    await withTransaction(async (tx) => {
      const deleted = await leadRepository.softDelete(id, user.id, tx);
      await writeAudit(tx, {
        entity: "source_lead",
        entityId: id,
        actor: user.id,
        action: "delete",
        before: { deletedAt: null },
        after: { deletedAt: deleted.deletedAt, deletedById: user.id, status: existing.status },
      });
    });
    return { id };
  },

  /**
   * Restore a soft-deleted lead — mirrors `candidateService.restore`: the lead returns EXACTLY as
   * it was (status/outreach untouched; only the delete markers clear). A missing lead → NOT_FOUND;
   * a live (not-deleted) lead → CONFLICT. Repo `restore` + a `restore` audit in one transaction.
   */
  async restore(id: string, user: AuthUser): Promise<LeadDetailDTO> {
    const existing = await leadRepository.findById(id, { includeDeleted: true });
    if (!existing) throw new AppError("NOT_FOUND", "Lead not found");
    if (existing.deletedAt === null) throw new AppError("CONFLICT", "Lead is not deleted");
    const restored = await withTransaction(async (tx) => {
      const lead = await leadRepository.restore(id, tx);
      await writeAudit(tx, {
        entity: "source_lead",
        entityId: id,
        actor: user.id,
        action: "restore",
        before: { deletedAt: existing.deletedAt, deletedById: existing.deletedById },
        after: { deletedAt: null, status: lead.status },
      });
      return lead;
    });
    return loadDetail(restored);
  },

  /** One lead's full detail (incl. soft-deleted — the "Show deleted" view inspects them too). */
  async detail(id: string): Promise<LeadDetailDTO> {
    const lead = await leadRepository.findById(id, { includeDeleted: true });
    if (!lead) throw new AppError("NOT_FOUND", "Lead not found");
    return loadDetail(lead);
  },

  /**
   * Snooze (`until` a date) or wake (`until: null`) a lead — `source_lead_snooze` parity. A
   * FUTURE snooze excludes the lead from stuck-lead alerts; consumers must be date-aware (the
   * legacy brief treated any non-empty value as snoozed forever — that bug stops here). A
   * Promoted lead can't be snoozed (its lifecycle is closed). Audited `snooze`/`wake`.
   */
  async snooze(id: string, until: Date | null, user: AuthUser): Promise<LeadDetailDTO> {
    const existing = await requireLead(id);
    if (until && existing.status === "Promoted") {
      throw new AppError("CONFLICT", "Lead already promoted");
    }
    const lead = await withTransaction(async (tx) => {
      const updated = await leadRepository.update(id, { snoozedUntil: until }, tx);
      await writeAudit(tx, {
        entity: "source_lead",
        entityId: id,
        actor: user.id,
        action: until ? "snooze" : "wake",
        before: { snoozedUntil: existing.snoozedUntil },
        after: { snoozedUntil: until },
      });
      return updated;
    });
    return loadDetail(lead);
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
    user: AuthUser,
  ): Promise<LeadDetailDTO> {
    await requireLead(id);
    const lead = await withTransaction(async (tx) => {
      const count = await leadRepository.updateOutreachAttempt(
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
      const synced = await leadRepository.syncOutreachDenorm(id, tx);
      await writeAudit(tx, {
        entity: "source_lead",
        entityId: id,
        actor: user.id,
        action: "edit_outreach",
        after: { attemptId, ...input },
      });
      return synced;
    });
    return loadDetail(lead);
  },

  /**
   * Delete one logged attempt (`source_lead_delete_outreach` parity — no role gate, audited).
   * The denormalized count/lastOutreachAt re-sync from the table; the lead's STATUS is NOT
   * regressed (legacy parity — un-advancing the funnel stays a manual status change).
   */
  async deleteOutreach(id: string, attemptId: string, user: AuthUser): Promise<LeadDetailDTO> {
    await requireLead(id);
    const lead = await withTransaction(async (tx) => {
      const count = await leadRepository.deleteOutreachAttempt(id, attemptId, tx);
      if (count === 0) throw new AppError("NOT_FOUND", "Outreach attempt not found");
      const synced = await leadRepository.syncOutreachDenorm(id, tx);
      await writeAudit(tx, {
        entity: "source_lead",
        entityId: id,
        actor: user.id,
        action: "delete_outreach",
        after: { attemptId },
      });
      return synced;
    });
    return loadDetail(lead);
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
    user: AuthUser,
  ): Promise<{ affected: number; skipped: number }> {
    const uniqueIds = [...new Set(input.ids)];
    const rows = await leadRepository.findManyByIds(uniqueIds, {
      includeDeleted: input.action === "restore",
    });
    const byId = new Map(rows.map((r) => [r.id, r]));

    // Validate cross-entity references ONCE, outside the loop.
    if (input.action === "assign") {
      const names = await userRepository.namesByIds([input.value]);
      if (!names.has(input.value)) throw new AppError("NOT_FOUND", "User not found");
    }
    if (input.action === "client" && input.value !== null) {
      const clients = await clientRepository.list();
      if (!clients.some((c) => c.id === input.value)) {
        throw new AppError("NOT_FOUND", "Client not found");
      }
    }

    const eligible = uniqueIds.filter((id) => {
      const row = byId.get(id);
      if (!row) return false;
      if (input.action === "restore") return row.deletedAt !== null;
      if (input.action === "delete") return true; // findManyByIds already excluded trashed rows
      if (input.action === "assign") return true;
      // status/client/outreach never touch a closed (Promoted) lead.
      return row.status !== "Promoted";
    });

    await withTransaction(async (tx) => {
      for (const id of eligible) {
        const row = byId.get(id)!;
        switch (input.action) {
          case "delete":
            await leadRepository.softDelete(id, user.id, tx);
            break;
          case "restore":
            await leadRepository.restore(id, tx);
            break;
          case "status":
            await leadRepository.update(id, { status: normalizeLeadStatus(input.value) }, tx);
            break;
          case "assign":
            await leadRepository.update(id, { createdById: input.value }, tx);
            break;
          case "client":
            await leadRepository.update(id, { clientId: input.value }, tx);
            break;
          case "outreach": {
            const at = new Date();
            await leadRepository.logOutreach(
              {
                leadId: id,
                channel: input.channel,
                note: input.note ?? null,
                at,
                actorId: user.id,
                status: advanceOnOutreach(row.status as LeadStatus),
              },
              tx,
            );
            break;
          }
        }
        await writeAudit(tx, {
          entity: "source_lead",
          entityId: id,
          actor: user.id,
          action: `bulk_${input.action}`,
          before: { status: row.status, deletedAt: row.deletedAt },
          after:
            input.action === "outreach"
              ? { channel: input.channel }
              : { value: "value" in input ? input.value : null },
        });
      }
    });

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
   */
  async importLeads(
    input: ImportLeadsInput,
    user: AuthUser,
  ): Promise<{ added: number; skipped: number }> {
    const emails = input.rows.map((r) => r.email?.toLowerCase()).filter((e): e is string => !!e);
    const namesForEmailless = input.rows
      .filter((r) => !r.email)
      .map((r) => r.name.trim().toLowerCase());
    const [byEmail, byName, clients] = await Promise.all([
      leadRepository.findManyByEmails(emails),
      leadRepository.findManyByNames(namesForEmailless),
      clientRepository.list(),
    ]);
    const existingEmails = new Set(byEmail.map((l) => l.email!.toLowerCase()));
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

    await withTransaction(async (tx) => {
      await leadRepository.createMany(
        kept.map((row) => ({
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
          outreachCount: 0,
          createdById: user.id,
        })),
        tx,
      );
      await writeAudit(tx, {
        entity: "source_lead",
        entityId: "bulk",
        actor: user.id,
        action: "bulk_import",
        after: { added: kept.length, skipped: input.rows.length - kept.length },
      });
    });

    return { added: kept.length, skipped: input.rows.length - kept.length };
  },
};
