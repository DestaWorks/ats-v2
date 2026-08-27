import "server-only";
import { aiSettingsRepository } from "@destaworks/db/repositories/ai-settings.repository";
import { aiUsageEventRepository } from "@destaworks/db/repositories/ai-usage-event.repository";
import { writeAudit } from "@destaworks/db/audit";
import { withTransaction } from "@destaworks/db/with-transaction";
import { toIso } from "@destaworks/domain/utils/iso";
import type { AuthUser } from "@destaworks/auth/guards";
import type { AiSettingsDTO, AiUsageOverviewDTO } from "@destaworks/contracts/validation/ai-ops";

const USAGE_WINDOW_HOURS = 24;
const RECENT_LIMIT = 20;

export const aiOpsService = {
  async getSettings(): Promise<AiSettingsDTO> {
    return aiSettingsRepository.get();
  },

  async setDisabled(
    disabled: boolean,
    actor: AuthUser,
    reason?: string | null,
  ): Promise<AiSettingsDTO> {
    const trimmedReason = reason?.trim();
    const disabledReason = disabled && trimmedReason ? trimmedReason : null;
    await withTransaction(async (tx) => {
      await aiSettingsRepository.setDisabled(disabled, actor.id, disabledReason, tx);
      await writeAudit(tx, {
        entity: "ai_settings",
        entityId: "singleton",
        actor: actor.id,
        action: disabled ? "disable" : "enable",
        after: { disabledReason },
      });
    });
    return { disabled, disabledReason };
  },

  async getUsageOverview(): Promise<AiUsageOverviewDTO> {
    const since = new Date(Date.now() - USAGE_WINDOW_HOURS * 60 * 60 * 1000);
    const [breakdown, recent] = await Promise.all([
      aiUsageEventRepository.summarySince(since),
      aiUsageEventRepository.listRecent(RECENT_LIMIT),
    ]);

    const successRow = breakdown.find((b) => b.status === "success");
    const errorRow = breakdown.find((b) => b.status === "error");
    const totalCalls = breakdown.reduce((sum, b) => sum + b.count, 0);
    const totalLatencyMs = breakdown.reduce((sum, b) => sum + b.latencyMsSum, 0);

    return {
      windowHours: USAGE_WINDOW_HOURS,
      totalCalls,
      successCount: successRow?.count ?? 0,
      errorCount: errorRow?.count ?? 0,
      totalInputTokens: breakdown.reduce((sum, b) => sum + b.inputTokens, 0),
      totalOutputTokens: breakdown.reduce((sum, b) => sum + b.outputTokens, 0),
      avgLatencyMs: totalCalls > 0 ? Math.round(totalLatencyMs / totalCalls) : 0,
      recent: recent.map((r) => ({
        id: r.id,
        operation: r.operation,
        provider: r.provider,
        model: r.model,
        status: r.status,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        latencyMs: r.latencyMs,
        errorName: r.errorName,
        errorStatusCode: r.errorStatusCode,
        createdAt: toIso(r.createdAt),
      })),
    };
  },
};
