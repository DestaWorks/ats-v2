import "server-only";
import type { Prisma, StageHistory } from "@/generated/prisma/client";
import { db } from "@/server/db/prisma";

/** A raw stage-history row (Prisma model). */
export type StageHistoryRow = StageHistory;

/** Fields recorded for one pipeline transition. */
export interface StageHistoryAddInput {
  candidateId: string;
  fromStatus?: string | null;
  toStatus: string;
  fromStageOrder?: number | null;
  toStageOrder: number;
  actorId: string;
}

/**
 * Stage-history data access — the append-only record of every pipeline transition. `add` is
 * normally called inside the same transaction as the candidate `update` + `writeAudit` (pass
 * the shared `tx`) so the history can't drift from the candidate's current stage.
 */
export const stageHistoryRepository = {
  add(input: StageHistoryAddInput, tx?: Prisma.TransactionClient) {
    return db(tx).stageHistory.create({
      data: {
        candidateId: input.candidateId,
        fromStatus: input.fromStatus ?? null,
        toStatus: input.toStatus,
        fromStageOrder: input.fromStageOrder ?? null,
        toStageOrder: input.toStageOrder,
        actorId: input.actorId,
      },
    });
  },

  listByCandidate(candidateId: string, tx?: Prisma.TransactionClient) {
    return db(tx).stageHistory.findMany({
      where: { candidateId },
      orderBy: { enteredAt: "desc" },
    });
  },

  latest(candidateId: string, tx?: Prisma.TransactionClient) {
    return db(tx).stageHistory.findFirst({
      where: { candidateId },
      orderBy: { enteredAt: "desc" },
    });
  },
};
