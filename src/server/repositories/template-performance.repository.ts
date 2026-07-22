import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db/prisma";

/**
 * Wave 4.1 (Templates) — every outreach attempt that was logged via a template. ONE query, not a
 * `groupBy` per metric: the in-memory grouping (`template-performance.service.ts`) needs per-row
 * `at`/`respondedAt` to compute avg-days-to-respond, which Prisma's `groupBy` aggregates can't
 * express directly. Row count is small (matches this app's current data scale — see
 * `credentials-intelligence.repository.ts`'s gap-analysis query for the same one-query-then-
 * in-memory-group pattern).
 */
export const templatePerformanceRepository = {
  attemptsWithTemplate(tx?: Prisma.TransactionClient) {
    return db(tx).outreachAttempt.findMany({
      where: { templateId: { not: null } },
      select: {
        templateId: true,
        channel: true,
        at: true,
        response: true,
        respondedAt: true,
        candidateId: true,
        leadId: true,
      },
    });
  },
};
