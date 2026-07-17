import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { COMPACT_STATES } from "@/lib/constants";
import { db } from "@/server/db/prisma";
import { FIRST_TERMINAL_ORDER } from "@/server/repositories/candidate.repository";

const MS_PER_DAY = 86_400_000;
/** Credentials eligible for NLC (Nurse Licensure Compact) multi-state practice — matches
 *  legacy's `compactHolders` filter (`legacy/index.html:2980`). */
const NLC_CREDENTIALS = ["NP", "APRN", "PMHNP", "PMHNP-BC"];

function nlcWhere(): Prisma.CandidateWhereInput {
  return {
    deletedAt: null,
    licenseState: { in: [...COMPACT_STATES] },
    credential: { in: NLC_CREDENTIALS },
  };
}

/**
 * Credentials Intelligence (Wave 3.6) data access — bespoke aggregate reads for the leadership
 * dashboard, mirroring `license-verify.repository.ts`'s pattern. The 6 stat cards need UNCAPPED
 * totals (unlike `licenseVerifyRepository`'s capped queue/timeline), so these are fresh `count`/
 * `groupBy` queries, not reuses of the Wave 3.4 reads.
 */
export const credentialsIntelligenceRepository = {
  /** The 6 stat-card counts, in one round of parallel queries. */
  async statCounts(now: Date, tx?: Prisma.TransactionClient) {
    const soon = new Date(now.getTime() + 90 * MS_PER_DAY);
    const [total, active, unverified, expired, expiringSoon, nlcCompact] = await Promise.all([
      db(tx).candidate.count({ where: { deletedAt: null } }),
      db(tx).candidate.count({ where: { deletedAt: null, licenseStatus: "Active" } }),
      db(tx).candidate.count({ where: { deletedAt: null, licenseStatus: "Not Verified" } }),
      db(tx).candidate.count({ where: { deletedAt: null, licenseStatus: "Expired" } }),
      db(tx).candidate.count({
        where: {
          deletedAt: null,
          licenseStatus: "Active",
          licenseExpiry: { gt: now, lte: soon },
        },
      }),
      db(tx).candidate.count({ where: nlcWhere() }),
    ]);
    return { total, active, unverified, expired, expiringSoon, nlcCompact };
  },

  /**
   * Credential×state cell counts for the coverage matrix — total per cell, and a second
   * "not yet Active" count for the per-cell "N unverified" sub-label. Two `groupBy` queries
   * (not N+1): rows/columns are derived by the SERVICE from whatever combinations actually
   * appear here, not iterated over the full state/credential lists.
   */
  async matrixCounts(tx?: Prisma.TransactionClient) {
    const [totals, unverified] = await Promise.all([
      db(tx).candidate.groupBy({
        by: ["credential", "licenseState"],
        where: { deletedAt: null, credential: { not: null }, licenseState: { not: null } },
        _count: { _all: true },
      }),
      db(tx).candidate.groupBy({
        by: ["credential", "licenseState"],
        where: {
          deletedAt: null,
          credential: { not: null },
          licenseState: { not: null },
          licenseStatus: { not: "Active" },
        },
        _count: { _all: true },
      }),
    ]);
    return { totals, unverified };
  },

  /**
   * ACTIVE-stage, client-scoped candidates for gap analysis (`stageOrder < FIRST_TERMINAL_ORDER`
   * — matches `stuckWhere`/`licenseVerifyRepository`'s "active work" convention, not legacy's
   * looser "not Future Pipeline only" filter, which counted rejected/no-response candidates as
   * "in pipeline"). Narrow select, grouped in-memory by the service — every row here already IS
   * "in pipeline" by definition, so the service doesn't need a separate inPipeline filter pass.
   */
  gapAnalysisCandidates(tx?: Prisma.TransactionClient) {
    return db(tx).candidate.findMany({
      where: { deletedAt: null, clientId: { not: null }, stageOrder: { lt: FIRST_TERMINAL_ORDER } },
      select: { clientId: true, credential: true, stageOrder: true, licenseStatus: true },
    });
  },

  /** NLC compact-license holders, capped small — the tracker's row list. */
  nlcCompactHolders(limit: number, tx?: Prisma.TransactionClient) {
    return db(tx).candidate.findMany({
      where: nlcWhere(),
      select: { id: true, name: true, credential: true, licenseState: true },
      orderBy: { name: "asc" },
      take: limit,
    });
  },
};
