import type { TenantContext } from "@destaworks/domain/tenant";
import type { Prisma } from "../generated/prisma/client";
import { db, type ScopedTx, scopedWrite } from "../tenant-scope";
import { CHILD_ROWS_CAP } from "../query-limits";

/** A raw outreach-attempt row (Prisma model). Services map this to `OutreachAttemptDTO`. */
export type OutreachAttemptRow = Prisma.OutreachAttemptGetPayload<Record<string, never>>;

/**
 * CANDIDATE-side access to the shared `outreach_attempts` table (L-3: one table serves both leads
 * and candidates — `lead.repository` owns the lead-side composites). `listForCandidate` merges the
 * attempts logged directly on the candidate with the history of the lead that was PROMOTED into it
 * (`lead.promotedCandidateId`), so a promoted candidate keeps its sourcing trail visible.
 */
export const outreachRepository = {
  /** All attempts for a candidate — direct + promoted-lead history, newest first. */
  listForCandidate(ctx: TenantContext, candidateId: string, tx?: ScopedTx) {
    return db(ctx, tx).outreachAttempt.findMany({
      where: {
        OR: [{ candidateId }, { lead: { promotedCandidateId: candidateId } }],
      },
      orderBy: [{ at: "desc" }, { id: "desc" }],
      take: CHILD_ROWS_CAP,
    });
  },

  /** Insert one candidate-side attempt (`candidate_log_outreach`). Callers pass the session actor. */
  createForCandidate(
    ctx: TenantContext,
    candidateId: string,
    data: { channel: string; note: string | null; actorId: string; templateId?: string | null },
    tx?: ScopedTx,
  ) {
    return db(ctx, tx).outreachAttempt.create({
      data: scopedWrite({
        candidateId,
        channel: data.channel,
        note: data.note,
        actorId: data.actorId,
        templateId: data.templateId ?? null,
      }),
    });
  },
};
