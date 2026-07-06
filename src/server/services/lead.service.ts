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
  CreateLeadInput,
  LeadDetailDTO,
  LeadListDTO,
  LeadListItemDTO,
  LogOutreachInput,
  OutreachAttemptDTO,
} from "@/lib/validation/lead";
import { encodeCursor, type PageCursor } from "@/lib/validation/cursor";
import { toIso, isoOrNull } from "@/lib/utils/iso";
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

/** One keyset page of the `/sourcing` inventory (mirrors the candidate `LIST_PAGE`). */
const LIST_PAGE = 50;

/** Filters accepted by the `/sourcing` list read — status/source/search + a keyset cursor. */
export interface LeadListFilters {
  status?: string;
  source?: string;
  search?: string;
  /** "Show deleted" — include soft-deleted rows (they render flagged, with Restore). */
  includeDeleted?: boolean;
  cursor?: PageCursor;
}

/** Project a lead row onto the inventory row DTO. `targetClientName` from the batch client map. */
function toLeadListItem(row: LeadRow, clientNames: Map<string, string>): LeadListItemDTO {
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
    targetClientName: row.clientId ? (clientNames.get(row.clientId) ?? null) : null,
    promotedCandidateId: row.promotedCandidateId,
    createdAt: toIso(row.createdAt),
    deletedAt: isoOrNull(row.deletedAt),
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
    ...toLeadListItem(row, clientNames),
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
  const [attempts, clients] = await Promise.all([
    leadRepository.listOutreach(lead.id),
    clientRepository.list(),
  ]);
  const clientNames = new Map(clients.map((c) => [c.id, c.name]));
  const actorNames = await userRepository.namesByIds(attempts.map((a) => a.actorId));
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
   * The `/sourcing` inventory — one keyset page (Newest-first) + the honest filtered `total`. Fetches
   * `LIST_PAGE + 1` rows so `hasMore` is exact and `nextCursor` walks the whole (filtered) set.
   * `targetClientName` is resolved from a one-shot `clients` map (as the candidate reads do).
   */
  async list(filters: LeadListFilters = {}): Promise<LeadListDTO> {
    const [rows, total, clients] = await Promise.all([
      leadRepository.list({ ...filters, take: LIST_PAGE + 1 }),
      leadRepository.count(filters),
      clientRepository.list(),
    ]);
    const hasMore = rows.length > LIST_PAGE;
    const page = hasMore ? rows.slice(0, LIST_PAGE) : rows;
    const clientNames = new Map(clients.map((c) => [c.id, c.name]));
    const leads = page.map((row) => toLeadListItem(row, clientNames));
    const nextCursor = hasMore ? encodeCursor(page[page.length - 1]!, "createdAt_desc") : null;
    return { leads, count: leads.length, hasMore, nextCursor, total };
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
   */
  async respond(id: string, kind: "hot" | "cold", user: AuthUser): Promise<LeadDetailDTO> {
    const existing = await requireLead(id);
    const status = existing.status as LeadStatus;
    if (!canRespond(status)) throw new AppError("CONFLICT", "Lead already promoted");
    const next = setResponse(kind === "hot" ? "Hot" : "Cold");
    const lead = await withTransaction(async (tx) => {
      const updated = await leadRepository.update(
        id,
        { status: next, respondedAt: existing.respondedAt ?? new Date() },
        tx,
      );
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
   */
  async promote(id: string, user: AuthUser): Promise<{ candidateId: string }> {
    const existing = await requireLead(id);
    if (!canPromote(existing.status as LeadStatus)) {
      throw new AppError("CONFLICT", "Lead already promoted");
    }
    const input = leadToCandidateInput(existing);
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
};
