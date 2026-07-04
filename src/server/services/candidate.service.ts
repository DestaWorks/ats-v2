import "server-only";
import {
  ACTIVE_STATUS_CODES,
  TERMINAL_STATUS_CODES,
  hasCapability,
  isCandidateStatus,
  isTerminalStatus,
  statusLabel,
  statusOrder,
  type CandidateStatus,
  type LicenseStatus,
  type Track,
} from "@/lib/constants";
import type {
  CandidateDetailDTO,
  CandidateProfileDTO,
  DocumentSummaryDTO,
  StageEventDTO,
  UpdateCandidateInput,
  VerifyLicenseInput,
} from "@/lib/validation/candidate";
import type { CandidateListDTO, CandidateListItemDTO } from "@/lib/validation/candidate";
import type {
  BoardResponse,
  BulkMoveResponse,
  CandidateCardDTO,
  DashboardStatsDTO,
} from "@/lib/validation/pipeline";
import { requireUser, type AuthUser } from "@/server/auth/guards";
import { writeAudit } from "@/server/db/audit";
import { withTransaction } from "@/server/db/with-transaction";
import { candidateRepository, type CandidateRow } from "@/server/repositories/candidate.repository";
import { clientRepository } from "@/server/repositories/client.repository";
import { documentRepository } from "@/server/repositories/document.repository";
import { noteRepository } from "@/server/repositories/note.repository";
import {
  stageHistoryRepository,
  type StageHistoryRow,
} from "@/server/repositories/stage-history.repository";
import { checkStageGate } from "@/lib/rules/stage-gates";
import { getDaysInStage, isOverdue, isStuck } from "@/lib/rules/stage-timing";
import { AppError } from "@/server/http/app-error";
import { visibleNotes, toNoteDTO } from "./note.service";
import { toDocumentDTO, type DocumentDTO } from "./document.dto";
import { toCandidateDTO, toRuleCandidate, type CandidateDTO } from "./candidate.dto";

/** Filters accepted by the board read (a subset of the repository's list filters). */
export interface BoardFilters {
  status?: CandidateStatus;
  track?: Track;
  clientId?: string;
  search?: string;
}

/**
 * Hard ceiling on the `/candidates` browse read. The list is a flat table (not the funnel board),
 * so it must be bounded — addresses the audit's unbounded-list finding for this new screen. When
 * the ceiling is hit the DTO carries `capped: true` and the UI shows a "showing first N" note.
 */
const LIST_CAP = 100;

/**
 * Per-column ceiling on the board payload. The board still counts every candidate (the column
 * header shows the TRUE total), but each column ships at most this many CARDS — so a 1,000-row stage
 * can't dump 1,000 cards onto the client. Full load-more pagination is a later follow-up.
 */
const BOARD_COLUMN_CAP = 50;

/** How many "needs attention" candidates the dashboard surfaces (a small, targeted read). */
const ATTENTION_LIMIT = 8;

/**
 * Project a raw candidate row onto the client-safe `CandidateCardDTO`. Runs through
 * `toCandidateDTO` first (the PII boundary) — the card type omits `licenseNumber` entirely, so
 * it can never reach a card regardless of viewer role. Timing is derived from `stageEnteredAt`.
 */
function toCard(
  row: CandidateRow,
  viewer: AuthUser,
  clientNames: Map<string, string>,
  now: Date,
): CandidateCardDTO {
  const dto = toCandidateDTO(row, viewer);
  const status = dto.status as CandidateStatus;
  return {
    id: dto.id,
    name: dto.name,
    track: dto.track as Track,
    credential: dto.credential,
    licenseState: dto.licenseState,
    licenseStatus: dto.licenseStatus as LicenseStatus,
    clientId: dto.clientId,
    clientName: dto.clientId ? (clientNames.get(dto.clientId) ?? null) : null,
    status,
    stageOrder: dto.stageOrder,
    daysInStage: getDaysInStage(dto.stageEnteredAt, now),
    isOverdue: isOverdue(status, dto.stageEnteredAt, now),
    isStuck: isStuck(dto.stageEnteredAt, now),
  };
}

/**
 * Project a raw candidate row onto the PII-gated `CandidateListItemDTO` for the browse list. Runs
 * through `toCandidateDTO` first (the PII boundary) — the list item type omits `licenseNumber`
 * entirely, so it can never reach a row. `clientName` is resolved from the batch-loaded client map.
 */
function toListItem(
  row: CandidateRow,
  viewer: AuthUser,
  clientNames: Map<string, string>,
  now: Date,
): CandidateListItemDTO {
  const dto = toCandidateDTO(row, viewer);
  const status = dto.status as CandidateStatus;
  return {
    id: dto.id,
    name: dto.name,
    credential: dto.credential,
    track: dto.track,
    clientName: dto.clientId ? (clientNames.get(dto.clientId) ?? null) : null,
    status,
    statusLabel: statusLabel(status),
    licenseStatus: dto.licenseStatus,
    daysInStage: getDaysInStage(dto.stageEnteredAt, now),
  };
}

/**
 * Domain input for creating a candidate. Interactive creates ALWAYS start at `NEW_CANDIDATE`
 * (stage 0) — status is intentionally NOT accepted here, so a create can never drop a candidate
 * mid-pipeline and skip the stage gate / stage-history / `placedAt` contract. Status only advances
 * through `move`. Bulk historical import that legitimately lands candidates at their current stage
 * uses the repository's `upsertByLegacyId` (the one-shot ETL path), not this service method.
 */
export interface CandidateCreateInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  employer?: string | null;
  yearsExp?: number | null;
  credential?: string | null;
  population?: string | null;
  setting?: string | null;
  track?: string;
  source?: string | null;
  tags?: string[];
  outreachAttempts?: number;
  licenseState?: string | null;
  licenseNumber?: string | null;
  licenseStatus?: string;
  licenseExpiry?: Date | null;
  clientId?: string | null;
  legacyId?: string | null;
}

/** Editable fields. `status`/pipeline timing are owned by `move` (denormalization contract). */
export type CandidateUpdateInput = Partial<Omit<CandidateCreateInput, "legacyId">>;

/** ISO-serialize a nullable Date for the wire (both `Response.json` and the RSC produce strings). */
function isoOrNull(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

/**
 * Project the PII-gated candidate DTO onto the serialized `CandidateProfileDTO` (ISO string dates).
 * `licenseNumber` is carried ONLY when `toCandidateDTO` included it (viewer had `viewCredentials`) —
 * the gate is inherited from the DTO, never re-decided here.
 */
function toCandidateProfileDTO(dto: CandidateDTO): CandidateProfileDTO {
  const profile: CandidateProfileDTO = {
    id: dto.id,
    name: dto.name,
    email: dto.email,
    phone: dto.phone,
    city: dto.city,
    state: dto.state,
    employer: dto.employer,
    yearsExp: dto.yearsExp,
    credential: dto.credential,
    population: dto.population,
    setting: dto.setting,
    track: dto.track,
    source: dto.source,
    tags: dto.tags,
    outreachAttempts: dto.outreachAttempts,
    licenseState: dto.licenseState,
    licenseStatus: dto.licenseStatus,
    licenseExpiry: isoOrNull(dto.licenseExpiry),
    licenseVerifiedAt: isoOrNull(dto.licenseVerifiedAt),
    licenseVerifiedById: dto.licenseVerifiedById,
    status: dto.status,
    stageOrder: dto.stageOrder,
    stageEnteredAt: dto.stageEnteredAt.toISOString(),
    placedAt: isoOrNull(dto.placedAt),
    clientId: dto.clientId,
    createdById: dto.createdById,
    createdAt: dto.createdAt.toISOString(),
    updatedAt: dto.updatedAt.toISOString(),
  };
  // Present only when the gate let it through (key absence, not null, means "hidden").
  if ("licenseNumber" in dto) profile.licenseNumber = dto.licenseNumber;
  return profile;
}

/** Project the PII-gated document DTO onto the serialized `DocumentSummaryDTO`. */
function toDocumentSummaryDTO(dto: DocumentDTO): DocumentSummaryDTO {
  const summary: DocumentSummaryDTO = {
    id: dto.id,
    candidateId: dto.candidateId,
    type: dto.type,
    originalFilename: dto.originalFilename,
    mimeType: dto.mimeType,
    sizeBytes: dto.sizeBytes,
    storageKey: dto.storageKey,
    legacyUrl: dto.legacyUrl,
    createdAt: dto.createdAt.toISOString(),
  };
  // Both fields ride together through the same `viewCredentials` gate in `toDocumentDTO`.
  if ("extractedText" in dto) summary.extractedText = dto.extractedText;
  if ("extractedData" in dto) summary.extractedData = dto.extractedData;
  return summary;
}

/** Project a stage-history row onto the serialized `StageEventDTO` (actor-name resolve deferred). */
function toStageEventDTO(row: StageHistoryRow): StageEventDTO {
  return {
    id: row.id,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    fromStageOrder: row.fromStageOrder,
    toStageOrder: row.toStageOrder,
    enteredAt: row.enteredAt.toISOString(),
    actorId: row.actorId,
  };
}

/**
 * Narrow a full candidate row to just the keys present in `input`, for a small audit snapshot.
 * before/after may hold PII — audit rows are `viewAudit`-gated (see `db/audit.ts`) and never logged.
 */
function pickAudited(row: CandidateRow, input: CandidateUpdateInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(input) as (keyof CandidateUpdateInput)[]) {
    out[key] = (row as Record<string, unknown>)[key];
  }
  return out;
}

/**
 * Candidate business logic. Services orchestrate repositories + pure rules and own authZ; they
 * never touch Prisma directly.
 *
 * AUTHZ: there is no candidate-specific capability — working the pipeline (create / edit / move /
 * soft-delete) is open to any signed-in user (Screener / Associate are the primary pipeline
 * workers and hold no capabilities). So `create`/`update`/`softDelete` gate with `requireUser()`;
 * `move` receives the already-authenticated `AuthUser` from its caller (the drag / bulk-move
 * handler). Hard purge — the capability-gated (`purgeCandidate`) destructive path — lands in
 * Wave 2.5, separate from this soft delete.
 */
export const candidateService = {
  async create(input: CandidateCreateInput) {
    const user = await requireUser();
    // Every interactive create starts New (stage 0). No status arg → no gate bypass.
    return candidateRepository.create({
      ...input,
      status: "NEW_CANDIDATE",
      stageOrder: statusOrder("NEW_CANDIDATE"),
      createdById: user.id,
    });
  },

  /**
   * Edit a candidate's PROFILE fields (identity/contact/clinical + `licenseState`/`clientId`).
   * Status / pipeline timing stay owned by `move`; license VERIFICATION fields stay owned by
   * `verifyLicense` — the zod schema at the route (`updateCandidateSchema.strict()`) rejects those
   * keys, so a pipeline/verification field can never route through here. Edit is an audited PII
   * mutation, so the repo update + `writeAudit` (before/after of the CHANGED keys only) run in one
   * transaction. `user` is the acting caller (route `requireUser()`); the `licenseNumber` gate is
   * enforced at the route before this is reached (design D-5).
   */
  async update(id: string, input: UpdateCandidateInput, user: AuthUser) {
    const existing = await candidateRepository.findById(id);
    if (!existing) throw new AppError("NOT_FOUND", "Candidate not found");
    return withTransaction(async (tx) => {
      const updated = await candidateRepository.update(id, input, tx);
      await writeAudit(tx, {
        entity: "candidate",
        entityId: id,
        actor: user.id,
        action: "update",
        before: pickAudited(existing, input),
        after: pickAudited(updated, input),
      });
      return updated;
    });
  },

  async softDelete(id: string) {
    const user = await requireUser();
    const existing = await candidateRepository.findById(id);
    if (!existing) throw new AppError("NOT_FOUND", "Candidate not found");
    return candidateRepository.softDelete(id, user.id);
  },

  /**
   * Read one candidate's full profile — the single composite the detail page needs (candidate +
   * documents + role-scoped notes + recent stage history + clientName), in one `CandidateDetailDTO`.
   * The RSC calls this DIRECTLY (no self-fetch); authZ is the caller's (`getCurrentUser()`), and
   * `viewer` drives the PII gate. Every PII boundary is REUSED, not re-implemented: `toCandidateDTO`
   * omits `licenseNumber`, `toDocumentDTO` omits `extractedText`/`extractedData`, both unless the
   * viewer holds `viewCredentials`; note visibility is `visibleNotes` (server-side, §3.2).
   */
  async getCandidateDetail(id: string, viewer: AuthUser): Promise<CandidateDetailDTO> {
    const candidate = await candidateRepository.findById(id);
    if (!candidate) throw new AppError("NOT_FOUND", "Candidate not found");

    const [documents, notes, history, clients] = await Promise.all([
      documentRepository.listByCandidate(id),
      noteRepository.listByCandidate(id),
      stageHistoryRepository.listByCandidate(id),
      clientRepository.list(),
    ]);

    const clientName = candidate.clientId
      ? (new Map(clients.map((c) => [c.id, c.name])).get(candidate.clientId) ?? null)
      : null;

    return {
      candidate: toCandidateProfileDTO(toCandidateDTO(candidate, viewer)),
      clientName,
      documents: documents.map((d) => toDocumentSummaryDTO(toDocumentDTO(d, viewer))),
      notes: visibleNotes(notes, viewer).map(toNoteDTO),
      stageHistory: history.slice(0, 10).map(toStageEventDTO),
      canVerifyCredentials: hasCapability(viewer.role, "viewCredentials"),
    };
  },

  /**
   * Verify a candidate's license — sets `licenseStatus` (+ optional `licenseExpiry`/`licenseNumber`)
   * and stamps WHO/WHEN (`licenseVerifiedById`/`licenseVerifiedAt`). License status DRIVES the stage
   * gates (INITIAL_SCREENING needs verified, SUBMITTED needs `Active`), so this is a load-bearing
   * pipeline action — OPEN TO OPERATORS (`requireUser` at the route), matching legacy. Writing
   * `licenseNumber` still requires `viewCredentials` (enforced at the route, design D-6). The update
   * + audit run in one transaction.
   */
  async verifyLicense(id: string, input: VerifyLicenseInput, user: AuthUser) {
    const existing = await candidateRepository.findById(id);
    if (!existing) throw new AppError("NOT_FOUND", "Candidate not found");
    const now = new Date();
    return withTransaction(async (tx) => {
      const updated = await candidateRepository.update(
        id,
        {
          licenseStatus: input.licenseStatus,
          ...(input.licenseExpiry !== undefined ? { licenseExpiry: input.licenseExpiry } : {}),
          ...(input.licenseNumber !== undefined ? { licenseNumber: input.licenseNumber } : {}),
          licenseVerifiedAt: now,
          licenseVerifiedById: user.id,
        },
        tx,
      );
      await writeAudit(tx, {
        entity: "candidate",
        entityId: id,
        actor: user.id,
        action: "verify_license",
        before: { licenseStatus: existing.licenseStatus, licenseExpiry: existing.licenseExpiry },
        after: { licenseStatus: updated.licenseStatus, licenseExpiry: updated.licenseExpiry },
      });
      return updated;
    });
  },

  /**
   * Read the `/candidates` browse list — a flat, PII-gated table (distinct from the funnel board).
   * AuthZ is the caller's (RSC `getCurrentUser()`); `viewer` drives the PII gate (`toCandidateDTO`
   * omits `licenseNumber`, so no row can carry it). The read is CAPPED at `LIST_CAP` rows at the
   * query level (repository `take`) — `capped` is true when the ceiling was hit. `clientName` is
   * resolved via a one-shot in-memory join over the small `clients` table (as `listBoard` does).
   */
  async listCandidates(filters: BoardFilters = {}, viewer: AuthUser): Promise<CandidateListDTO> {
    const [rows, clients] = await Promise.all([
      candidateRepository.list({ ...filters, take: LIST_CAP }),
      clientRepository.list(),
    ]);
    const clientNames = new Map(clients.map((c) => [c.id, c.name]));
    const now = new Date();
    const candidates = rows.map((row) => toListItem(row, viewer, clientNames, now));
    return { candidates, count: candidates.length, capped: candidates.length >= LIST_CAP };
  },

  /**
   * Dashboard summary WITHOUT loading the whole candidate table (audit perf finding). Per-status
   * counts come from a Prisma `groupBy` (the funnel + total/active/terminal); the "needs attention"
   * list is a SMALL targeted read of the oldest-in-stage active candidates (`take: ATTENTION_LIMIT`)
   * filtered to those actually overdue/stuck. AuthZ is the caller's; `viewer` drives the card PII gate.
   */
  async dashboardStats(viewer: AuthUser): Promise<DashboardStatsDTO> {
    const [grouped, staleRows, clients] = await Promise.all([
      candidateRepository.groupByStatus(),
      candidateRepository.listStaleActive(ATTENTION_LIMIT),
      clientRepository.list(),
    ]);

    const countByStatus = new Map<string, number>();
    for (const g of grouped) countByStatus.set(g.status, g._count._all);

    let total = 0;
    let active = 0;
    for (const [status, n] of countByStatus) {
      total += n;
      if (isCandidateStatus(status) && !isTerminalStatus(status)) active += n;
    }

    const columns = ACTIVE_STATUS_CODES.map((status) => ({
      status,
      label: statusLabel(status),
      count: countByStatus.get(status) ?? 0,
    }));

    const clientNames = new Map(clients.map((c) => [c.id, c.name]));
    const now = new Date();
    const attention = staleRows
      .map((row) => toCard(row, viewer, clientNames, now))
      .filter((c) => c.isOverdue || c.isStuck);

    return { total, active, terminal: total - active, columns, attention };
  },

  /**
   * Read the pipeline board — funnel-grouped candidates with derived stage timing. AuthZ is the
   * caller's (route `requireUser()` / RSC `getCurrentUser()`); `viewer` is passed in for the PII
   * boundary. Returns exactly the 9 active columns (order 0..8, empties present), a terminal
   * summary (counts always; card lists only when `includeTerminal`), and aggregate `meta`.
   *
   * `clientName` is resolved by fetching the small `clients` table once into an `id → name` map
   * (in-memory join) — this avoids a per-row Prisma join and keeps the shared `list` untouched.
   */
  async listBoard(
    filters: BoardFilters = {},
    viewer: AuthUser,
    opts: { includeTerminal?: boolean } = {},
  ): Promise<BoardResponse> {
    const [rows, clients] = await Promise.all([
      candidateRepository.list(filters),
      clientRepository.list(),
    ]);
    const clientNames = new Map(clients.map((c) => [c.id, c.name]));
    const now = new Date();

    const cardsByStatus = new Map<CandidateStatus, CandidateCardDTO[]>();
    let active = 0;
    let overdue = 0;
    let stuck = 0;
    for (const row of rows) {
      const card = toCard(row, viewer, clientNames, now);
      const bucket = cardsByStatus.get(card.status);
      if (bucket) bucket.push(card);
      else cardsByStatus.set(card.status, [card]);
      if (!isTerminalStatus(card.status)) {
        active += 1;
        if (card.isOverdue) overdue += 1;
        if (card.isStuck) stuck += 1;
      }
    }

    // Per-column cap: `count` is the TRUE total; `candidates` is at most `BOARD_COLUMN_CAP` cards.
    const columns = ACTIVE_STATUS_CODES.map((status) => {
      const all = cardsByStatus.get(status) ?? [];
      return {
        status,
        label: statusLabel(status),
        stageOrder: statusOrder(status),
        count: all.length,
        candidates: all.slice(0, BOARD_COLUMN_CAP),
      };
    });

    const terminal = TERMINAL_STATUS_CODES.map((status) => {
      const all = cardsByStatus.get(status) ?? [];
      return {
        status,
        label: statusLabel(status),
        count: all.length,
        ...(opts.includeTerminal ? { candidates: all.slice(0, BOARD_COLUMN_CAP) } : {}),
      };
    });

    return { columns, terminal, meta: { total: rows.length, active, overdue, stuck } };
  },

  /**
   * Move many candidates INTO `toStatus`. Partial success, NO gate bypass: each id runs the same
   * server-authoritative `move` (gate → txn update + stage_history + audit) in ITS OWN
   * transaction, so one blocked (or missing) candidate never rolls back the valid moves. Gate
   * blocks and not-found land in `blocked` with the reason string; anything unexpected re-throws.
   */
  async bulkMove(
    ids: string[],
    toStatus: CandidateStatus,
    user: AuthUser,
  ): Promise<BulkMoveResponse> {
    const moved: string[] = [];
    const blocked: { id: string; reason: string }[] = [];
    for (const id of ids) {
      try {
        await candidateService.move(id, toStatus, user);
        moved.push(id);
      } catch (err) {
        // Expected per-candidate outcomes (gate block, not found, unknown status) are collected,
        // not thrown — a bulk sweep must not lose the valid moves. Unexpected errors bubble up.
        if (
          err instanceof AppError &&
          (err.code === "STAGE_BLOCKED" || err.code === "NOT_FOUND" || err.code === "BAD_REQUEST")
        ) {
          blocked.push({ id, reason: err.message });
        } else {
          throw err;
        }
      }
    }
    return { moved, blocked };
  },

  /**
   * Move a candidate INTO `toStatus`. Server-authoritative: every transition (single drag AND
   * bulk) runs the stage gate. On success, atomically (1) updates the candidate's denormalized
   * pipeline columns, (2) appends a `stage_history` row, and (3) writes the audit entry — all in
   * one transaction so the trail can never drift from the data.
   */
  async move(id: string, toStatus: CandidateStatus, user: AuthUser) {
    // Defense-in-depth: `toStatus` is typed, but at a route boundary it's whatever the client
    // sent. Reject an unknown code before it reaches `statusOrder()` (which would throw on undefined).
    if (!isCandidateStatus(toStatus)) {
      throw new AppError("BAD_REQUEST", `Unknown pipeline status: ${toStatus}`);
    }
    const existing = await candidateRepository.findById(id);
    if (!existing) throw new AppError("NOT_FOUND", "Candidate not found");

    const blocking = checkStageGate(toRuleCandidate(existing), toStatus);
    if (blocking.length > 0) {
      throw new AppError("STAGE_BLOCKED", blocking.join("; "));
    }

    const now = new Date();
    const toStageOrder = statusOrder(toStatus);
    // placedAt is set once, the first time the candidate reaches "Started (Day 1)".
    const placedAt = toStatus === "STARTED_DAY1" ? (existing.placedAt ?? now) : existing.placedAt;

    return withTransaction(async (tx) => {
      const updated = await candidateRepository.update(
        id,
        { status: toStatus, stageOrder: toStageOrder, stageEnteredAt: now, placedAt },
        tx,
      );
      await stageHistoryRepository.add(
        {
          candidateId: id,
          fromStatus: existing.status,
          toStatus,
          fromStageOrder: existing.stageOrder,
          toStageOrder,
          actorId: user.id,
        },
        tx,
      );
      await writeAudit(tx, {
        entity: "candidate",
        entityId: id,
        actor: user.id,
        action: "move",
        before: { status: existing.status, stageOrder: existing.stageOrder },
        after: { status: toStatus, stageOrder: toStageOrder },
      });
      return updated;
    });
  },
};
