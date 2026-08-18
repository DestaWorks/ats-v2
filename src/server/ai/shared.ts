import "server-only";
import { randomUUID } from "node:crypto";
import { APICallError } from "ai";
import type { ZodType } from "zod";
import { AppError } from "@/server/http/app-error";
import { aiSettingsRepository } from "@/server/repositories/ai-settings.repository";
import { aiEnabled } from "./config";
import { generateStructured } from "./provider";

/**
 * Shared call-site for every structured-AI-generation module in this app (Wave 5.1's Daily/
 * Weekly Brief + Patterns + Targets-Suggest, Wave 4.2's AI Client Workspace) — same `aiEnabled`
 * guard + `AppError` mapping every AI module uses (`extract-inbound.ts`/`parse-resume.ts`),
 * factored out once rather than re-implemented per module. Originally lived at
 * `ai/briefs/shared.ts`; relocated here once a second, non-brief module (CRM) needed it too.
 */
export async function isAiAvailable(): Promise<boolean> {
  if (!aiEnabled) return false;
  const { disabled } = await aiSettingsRepository.getCached();
  return !disabled;
}

export async function generateAi<T>(
  featureLabel: string,
  opts: { schema: ZodType<T>; system: string; prompt: string; maxOutputTokens?: number },
): Promise<T> {
  if (!(await isAiAvailable())) {
    throw new AppError("FEATURE_DISABLED", `${featureLabel} is not configured`);
  }
  try {
    return await generateStructured({ ...opts, operation: featureLabel });
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (APICallError.isInstance(err)) {
      if (err.statusCode === 401 || err.statusCode === 403) {
        throw new AppError("FEATURE_DISABLED", `${featureLabel} is not configured`);
      }
      if (err.statusCode === 429) {
        throw new AppError("RATE_LIMITED", `${featureLabel} is busy, please retry shortly`);
      }
    }
    // Unlike apiHandler's own catch-all, this one was previously silent — every AI failure that
    // isn't a clean 401/403/429 vanished with zero trace. Log just enough to diagnose (name,
    // status code, a correlation ref) — never the prompt/response, which can carry candidate PII.
    const ref = randomUUID();
    const name = err instanceof Error ? err.name : "UnknownError";
    const statusCode = APICallError.isInstance(err) ? err.statusCode : undefined;
    console.error(
      `AI generation failed [ref=${ref}] feature="${featureLabel}" name=${name}` +
        (statusCode ? ` statusCode=${statusCode}` : ""),
    );
    throw new AppError("EXTRACTION_FAILED", `${featureLabel} could not be generated (ref: ${ref})`);
  }
}
