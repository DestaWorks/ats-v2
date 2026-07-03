import "server-only";
import { statusOrder, isCandidateStatus, type CandidateStatus } from "@/lib/constants";
import { requireUser, type AuthUser } from "@/server/auth/guards";
import { writeAudit } from "@/server/db/audit";
import { withTransaction } from "@/server/db/with-transaction";
import { candidateRepository } from "@/server/repositories/candidate.repository";
import { stageHistoryRepository } from "@/server/repositories/stage-history.repository";
import { checkStageGate } from "@/server/rules/stage-gates";
import { AppError } from "@/server/http/app-error";
import { toRuleCandidate } from "./candidate.dto";

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
