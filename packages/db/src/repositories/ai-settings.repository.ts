import { db, type ScopedTx, scopedWrite } from "../tenant-scope";
import type { TenantContext } from "@destaworks/domain/tenant";
import { logger } from "@destaworks/config/logger";

const CACHE_TTL_MS = 5000;

export interface AiSettingsRow {
  disabled: boolean;
  disabledReason: string | null;
}

/** One entry per tenant: the kill switch is per workspace, so the cache must be too. */
const cached = new Map<string, { value: AiSettingsRow; expiresAt: number }>();

export const aiSettingsRepository = {
  async get(ctx: TenantContext, tx?: ScopedTx): Promise<AiSettingsRow> {
    try {
      const row = await db(ctx, tx).aiSettings.findFirst();
      return { disabled: row?.disabled ?? false, disabledReason: row?.disabledReason ?? null };
    } catch (err) {
      logger.error("ai.settings.read_failed", {
        errorType: err instanceof Error ? err.name : "UnknownError",
      });
      return { disabled: false, disabledReason: null };
    }
  },

  async getCached(ctx: TenantContext): Promise<AiSettingsRow> {
    const now = Date.now();
    const hit = cached.get(ctx.tenantId);
    if (hit && hit.expiresAt > now) return hit.value;
    const value = await this.get(ctx);
    cached.set(ctx.tenantId, { value, expiresAt: now + CACHE_TTL_MS });
    return value;
  },

  async setDisabled(
    ctx: TenantContext,
    disabled: boolean,
    updatedBy: string,
    disabledReason: string | null,
    tx?: ScopedTx,
  ): Promise<void> {
    const scoped = db(ctx, tx);
    const existing = await scoped.aiSettings.findFirst({ select: { id: true } });
    if (existing) {
      await scoped.aiSettings.update({
        where: { id: existing.id },
        data: { disabled, disabledReason, updatedBy },
      });
    } else {
      await scoped.aiSettings.create({
        data: scopedWrite({ id: ctx.tenantId, disabled, disabledReason, updatedBy }),
      });
    }
    cached.set(ctx.tenantId, {
      value: { disabled, disabledReason },
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
  },
};
