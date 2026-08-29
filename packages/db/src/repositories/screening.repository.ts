import type { TenantContext } from "@destaworks/domain/tenant";
import type { ScreeningScorecard } from "../generated/prisma/client";
import { db, type ScopedTx } from "../tenant-scope";

/** A raw screening-scorecard row (Prisma model). Services/DTOs map this to API shapes. */
export type ScreeningScorecardRow = ScreeningScorecard;

export interface CreateScorecardData {
  candidateId: string;
  clientId: string | null;
  credentialsHeld: string[];
  statesHeld: string[];
  yearsExp: number | null;
  schedule: string | null;
  salaryAsk: number | null;
  commChecklist: string[];
  credScore: number;
  stateScore: number;
  expScore: number;
  scheduleScore: number;
  salaryScore: number;
  commScore: number;
  totalPct: number;
  decision: string;
  notes: string | null;
  scoredById: string;
}

/**
 * Screening-scorecard data access (Wave 3.3) — the ONLY layer that touches Prisma for scorecards.
 * Append-only: one row per scoring event (mirrors `stageHistoryRepository`), never an upsert.
 */
export const screeningRepository = {
  create(ctx: TenantContext, data: CreateScorecardData, tx?: ScopedTx) {
    return db(ctx, tx).screeningScorecard.create({ data });
  },

  /** Newest-first scoring history for one candidate (detail views, later waves). */
  listByCandidate(ctx: TenantContext, candidateId: string, tx?: ScopedTx) {
    return db(ctx, tx).screeningScorecard.findMany({
      where: { candidateId },
      orderBy: { scoredAt: "desc" },
    });
  },
};
