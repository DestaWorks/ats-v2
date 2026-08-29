import type { TenantContext } from "@destaworks/domain/tenant";
import { bridgeUnscopedCallers, db, type ScopedTx } from "../tenant-scope";
import { logger } from "@destaworks/config/logger";

const SINGLETON_ID = "singleton";
const CACHE_TTL_MS = 5000;

export interface AiSettingsRow {
  disabled: boolean;
  disabledReason: string | null;
}

let cached: { value: AiSettingsRow; expiresAt: number } | null = null;

export const aiSettingsRepository = bridgeUnscopedCallers({
  async get(ctx: TenantContext, tx?: ScopedTx): Promise<AiSettingsRow> {
    try {
      const row = await db(ctx, tx).aiSettings.findUnique({ where: { id: SINGLETON_ID } });
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
    if (cached && cached.expiresAt > now) return cached.value;
    const value = await this.get(ctx);
    cached = { value, expiresAt: now + CACHE_TTL_MS };
    return value;
  },

  async setDisabled(
    ctx: TenantContext,
    disabled: boolean,
    updatedBy: string,
    disabledReason: string | null,
    tx?: ScopedTx,
  ): Promise<void> {
    await db(ctx, tx).aiSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, disabled, disabledReason, updatedBy },
      update: { disabled, disabledReason, updatedBy },
    });
    cached = { value: { disabled, disabledReason }, expiresAt: Date.now() + CACHE_TTL_MS };
  },
});
