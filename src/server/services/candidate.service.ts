import "server-only";
import {
  ACTIVE_STATUS_CODES,
  TERMINAL_STATUS_CODES,
  isCandidateStatus,
  isTerminalStatus,
  statusLabel,
  statusOrder,
  type CandidateStatus,
  type LicenseStatus,
  type Track,
} from "@/lib/constants";
import type { BoardResponse, BulkMoveResponse, CandidateCardDTO } from "@/lib/validation/pipeline";
import { requireUser, type AuthUser } from "@/server/auth/guards";
import { writeAudit } from "@/server/db/audit";
import { withTransaction } from "@/server/db/with-transaction";
import { candidateRepository, type CandidateRow } from "@/server/repositories/candidate.repository";
import { clientRepository } from "@/server/repositories/client.repository";
import { stageHistoryRepository } from "@/server/repositories/stage-history.repository";
import { checkStageGate } from "@/server/rules/stage-gates";
import { getDaysInStage, isOverdue, isStuck } from "@/server/rules/stage-timing";
import { AppError } from "@/server/http/app-error";
import { toCandidateDTO, toRuleCandidate } from "./candidate.dto";

/** Filters accepted by the board read (a subset of the repository's list filters). */
export interface BoardFilters {
  status?: CandidateStatus;
  track?: Track;
  clientId?: string;
  search?: string;
}

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

  async update(id: string, input: CandidateUpdateInput) {
    await requireUser();
    const existing = await candidateRepository.findById(id);
    if (!existing) throw new AppError("NOT_FOUND", "Candidate not found");
    return candidateRepository.update(id, input);
  },

  async softDelete(id: string) {
    const user = await requireUser();
    const existing = await candidateRepository.findById(id);
    if (!existing) throw new AppError("NOT_FOUND", "Candidate not found");
    return candidateRepository.softDelete(id, user.id);
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

    const columns = ACTIVE_STATUS_CODES.map((status) => {
      const candidates = cardsByStatus.get(status) ?? [];
      return {
        status,
        label: statusLabel(status),
        stageOrder: statusOrder(status),
        count: candidates.length,
        candidates,
      };
    });

    const terminal = TERMINAL_STATUS_CODES.map((status) => {
      const candidates = cardsByStatus.get(status) ?? [];
      return {
        status,
        label: statusLabel(status),
        count: candidates.length,
        ...(opts.includeTerminal ? { candidates } : {}),
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
