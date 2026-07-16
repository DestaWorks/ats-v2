import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db/prisma";
import { FIRST_TERMINAL_ORDER } from "@/server/repositories/candidate.repository";

/**
 * License Verify data access (Wave 3.4) — the two derived reads behind the `/license-verify`
 * dashboard. Split out from `candidate.repository.ts` (kept that file under the ~400-line review
 * flag) rather than bolted on, mirroring how Screening got its own `screening.repository.ts`.
 * Both reads use a narrow Prisma `select` (matches `candidateRepository.alertBuckets`) — no PII
 * columns, so no `decryptRow` step is needed.
 */
export const licenseVerifyRepository = {
  /**
   * Candidates needing license verification — the Verification Queue
   * (`legacy/index.html:3001-3016`). Scoped to ACTIVE stages (`stageOrder < FIRST_TERMINAL_ORDER`,
   * matching `candidateRepository.stuckWhere`'s convention) so a candidate already
   * rejected/future-pipelined doesn't masquerade as live work. Oldest first (`createdAt asc`) so
   * the cap surfaces the longest-waiting — most overdue — candidates rather than silently hiding
   * them behind newer ones; over-fetches by one row so the caller can detect `hasMore` (mirrors
   * the `pageSize + 1` convention documented on `candidateRepository.list`).
   */
  async verificationQueue(limit: number, tx?: Prisma.TransactionClient) {
    const rows = await db(tx).candidate.findMany({
      where: {
        deletedAt: null,
        licenseStatus: "Not Verified",
        stageOrder: { lt: FIRST_TERMINAL_ORDER },
      },
      select: {
        id: true,
        name: true,
        credential: true,
        licenseState: true,
        clientId: true,
        licenseStatus: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: limit + 1,
    });
    return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
  },

  /**
   * Active-licensed candidates with a known expiry, soonest-first, capped small — the Expiry
   * Timeline (`legacy/index.html:3018-3037`). Scoped to ACTIVE stages (same convention as
   * `verificationQueue`) so a rejected/future-pipelined candidate doesn't crowd out real renewal
   * follow-ups in the small capped list. Bespoke read (not `candidateRepository.list`) since
   * `licenseExpiry` sort isn't part of the generic `ListOrderBy` union and this read never
   * paginates.
   */
  async expiryTimeline(limit: number, tx?: Prisma.TransactionClient) {
    return db(tx).candidate.findMany({
      where: {
        deletedAt: null,
        licenseStatus: "Active",
        licenseExpiry: { not: null },
        stageOrder: { lt: FIRST_TERMINAL_ORDER },
      },
      select: {
        id: true,
        name: true,
        credential: true,
        licenseState: true,
        licenseExpiry: true,
      },
      orderBy: { licenseExpiry: "asc" },
      take: limit,
    });
  },
};
