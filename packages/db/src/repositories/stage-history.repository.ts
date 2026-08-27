import "server-only";
import type { Prisma, StageHistory } from "../generated/prisma/client";
import { db } from "../prisma";
import { FIRST_TERMINAL_ORDER } from "./candidate.repository";

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

  /** Bulk history for a set of candidates, chronological within each candidate (Wave 5.2 Mass
   *  Journey — ONE query for a whole cohort instead of one `listByCandidate` call per row). */
  listByCandidateIds(ids: string[], tx?: Prisma.TransactionClient) {
    if (ids.length === 0) return Promise.resolve([]);
    return db(tx).stageHistory.findMany({
      where: { candidateId: { in: ids } },
      orderBy: [{ candidateId: "asc" }, { enteredAt: "asc" }],
    });
  },

  /**
   * Candidates that entered `toStatus` within the window, per owning associate (Wave 5.1 Briefs
   * "hires" count — `STARTED_DAY1` transitions, attributed to `candidate.createdById`, the same
   * ownership column `dailyRepository.countCandidatesAdded` already uses). ONE definition, not
   * legacy's two divergent ones (activity-log Action text vs candidate Tags field).
   */
  async enteredStatusCountsByRange(
    toStatus: string,
    w: { start: Date; end: Date },
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, number>> {
    const rows = await db(tx).stageHistory.findMany({
      where: { toStatus, enteredAt: { gte: w.start, lt: w.end } },
      select: { candidate: { select: { createdById: true } } },
    });
    const counts = new Map<string, number>();
    for (const row of rows) {
      const ownerId = row.candidate.createdById;
      if (!ownerId) continue;
      counts.set(ownerId, (counts.get(ownerId) ?? 0) + 1);
    }
    return counts;
  },

  /**
   * Every candidate's highest ACTIVE-stage `toStageOrder` reached at or before `asOf` (Wave 5.2
   * reports — the fix for legacy's `STATUSES.indexOf(status) >= idx` "reached-or-beyond" bug: a
   * candidate later REJECTED still correctly shows how far they got, since this reads real
   * history, not current status order).
   *
   * Deliberately excludes transitions INTO a terminal status (`toStageOrder >= FIRST_TERMINAL_ORDER`,
   * i.e. Not Qualified/No Response/Client Rejected/Future Pipeline): those codes' `order` values
   * (9-12) are numerically HIGHER than "Started (Day 1)" (8), so naively taking the max over ALL
   * history rows would make a rejected candidate look like they'd reached Started — reproducing a
   * variant of the exact bug this method exists to fix. A rejection transition is an EXIT, not
   * further progress through the active funnel.
   *
   * Global/unscoped — callers join the returned map against whichever candidate cohort they
   * already loaded (per client/associate/source), so this runs ONCE per report request.
   */
  async maxStageOrderAsOf(asOf: Date, tx?: Prisma.TransactionClient): Promise<Map<string, number>> {
    // Perf audit 2026-08-03: was `findMany` + a manual per-candidate max reduced in JS — pulled
    // EVERY matching row into memory on every call (5 report endpoints call this). MAX(...) GROUP
    // BY candidateId does the exact same aggregation in Postgres instead, covered by the
    // (enteredAt, toStageOrder, candidateId) index below (index-only scan, no heap access).
    const rows = await db(tx).stageHistory.groupBy({
      by: ["candidateId"],
      where: { enteredAt: { lte: asOf }, toStageOrder: { lt: FIRST_TERMINAL_ORDER } },
      _max: { toStageOrder: true },
    });
    const max = new Map<string, number>();
    for (const row of rows) {
      if (row._max.toStageOrder !== null) max.set(row.candidateId, row._max.toStageOrder);
    }
    return max;
  },
};
