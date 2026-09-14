import { z } from "zod";

export const setAiDisabledSchema = z.object({
  disabled: z.boolean(),
  reason: z.string().trim().max(500).nullish(),
});
export type SetAiDisabledInput = z.infer<typeof setAiDisabledSchema>;

export interface AiSettingsDTO {
  disabled: boolean;
  disabledReason: string | null;
}

export interface AiUsageEventDTO {
  id: string;
  operation: string;
  provider: string;
  model: string;
  status: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  errorName: string | null;
  errorStatusCode: number | null;
  createdAt: string;
}

export interface AiUsageOverviewDTO {
  windowHours: number;
  totalCalls: number;
  successCount: number;
  errorCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  avgLatencyMs: number;
  recent: AiUsageEventDTO[];
}
