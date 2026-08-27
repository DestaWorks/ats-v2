import "server-only";
import { prisma } from "../prisma";
import { logger } from "@destaworks/config/logger";

export interface AiUsageEventInput {
  operation: string;
  provider: string;
  model: string;
  status: "success" | "error";
  inputTokens?: number | null;
  outputTokens?: number | null;
  latencyMs: number;
  errorName?: string | null;
  errorStatusCode?: number | null;
}

export interface AiUsageStatusBreakdown {
  status: string;
  count: number;
  inputTokens: number;
  outputTokens: number;
  latencyMsSum: number;
}

export const aiUsageEventRepository = {
  async record(data: AiUsageEventInput): Promise<void> {
    try {
      await prisma.aiUsageEvent.create({ data });
    } catch (err) {
      logger.error("ai.usage_event.record_failed", {
        errorType: err instanceof Error ? err.name : "UnknownError",
      });
    }
  },

  listRecent(limit: number) {
    return prisma.aiUsageEvent.findMany({ orderBy: { createdAt: "desc" }, take: limit });
  },

  async summarySince(since: Date): Promise<AiUsageStatusBreakdown[]> {
    const grouped = await prisma.aiUsageEvent.groupBy({
      by: ["status"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      _sum: { inputTokens: true, outputTokens: true, latencyMs: true },
    });
    return grouped.map((g) => ({
      status: g.status,
      count: g._count._all,
      inputTokens: g._sum.inputTokens ?? 0,
      outputTokens: g._sum.outputTokens ?? 0,
      latencyMsSum: g._sum.latencyMs ?? 0,
    }));
  },
};
