import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db/prisma";

const SINGLETON_ID = "singleton";
const CACHE_TTL_MS = 5000;

export interface AiSettingsRow {
  disabled: boolean;
  disabledReason: string | null;
}

let cached: { value: AiSettingsRow; expiresAt: number } | null = null;

export const aiSettingsRepository = {
  async get(tx?: Prisma.TransactionClient): Promise<AiSettingsRow> {
    try {
      const row = await db(tx).aiSettings.findUnique({ where: { id: SINGLETON_ID } });
      return { disabled: row?.disabled ?? false, disabledReason: row?.disabledReason ?? null };
    } catch (err) {
      console.error("Failed to read AI settings:", err instanceof Error ? err.message : err);
      return { disabled: false, disabledReason: null };
    }
  },

  async getCached(): Promise<AiSettingsRow> {
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.value;
    const value = await this.get();
    cached = { value, expiresAt: now + CACHE_TTL_MS };
    return value;
  },

  async setDisabled(
    disabled: boolean,
    updatedBy: string,
    disabledReason: string | null,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await db(tx).aiSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, disabled, disabledReason, updatedBy },
      update: { disabled, disabledReason, updatedBy },
    });
    cached = { value: { disabled, disabledReason }, expiresAt: Date.now() + CACHE_TTL_MS };
  },
};
