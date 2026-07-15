import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db/prisma";

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
  listForCandidate(candidateId: string, tx?: Prisma.TransactionClient) {
    return db(tx).outreachAttempt.findMany({
      where: {
        OR: [{ candidateId }, { lead: { promotedCandidateId: candidateId } }],
      },
      orderBy: [{ at: "desc" }, { id: "desc" }],
    });
  },

  /** Insert one candidate-side attempt (`candidate_log_outreach`). Callers pass the session actor. */
  createForCandidate(
    candidateId: string,
    data: { channel: string; note: string | null; actorId: string },
    tx?: Prisma.TransactionClient,
  ) {
    return db(tx).outreachAttempt.create({
      data: { candidateId, channel: data.channel, note: data.note, actorId: data.actorId },
    });
  },
};
