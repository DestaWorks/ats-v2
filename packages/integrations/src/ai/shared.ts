import { randomUUID } from "node:crypto";
import { APICallError } from "ai";
import type { ZodType } from "zod";
import { AppError } from "../http/app-error";
import { logger } from "@destaworks/config/logger";
import { getLogContext } from "@destaworks/config/logger/request-context";
import { aiSettingsRepository } from "@destaworks/db/repositories/ai-settings.repository";
import { aiEnabled } from "./config";
import { isAbortError, startAiDeadline, type AiCallOptions } from "./deadline";
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

/**
 * Run one structured-AI operation under a wall-clock deadline.
 *
 * The deadline is started HERE, once, and covers everything downstream — both models and every
 * retry inside each — because this is the one place every AI feature passes through. Putting it
 * per feature would give six copies that drift; putting it per attempt would bound nothing (see
 * `./deadline`). `opts.signal` is the caller's own cancellation (a job's `ctx.signal`, a request's)
 * and composes with the budget rather than replacing it; `opts.budgetMs` overrides the ceiling for
 * an operation that legitimately needs longer. Omitting both keeps the previous call shape working
 * and simply adds the default ceiling, so every existing feature gains it without changing.
 */
export async function generateAi<T>(
  featureLabel: string,
  opts: {
    schema: ZodType<T>;
    system: string;
    prompt: string;
    maxOutputTokens?: number;
  } & AiCallOptions,
): Promise<T> {
  if (!(await isAiAvailable())) {
    throw new AppError("FEATURE_DISABLED", `${featureLabel} is not configured`);
  }
  const deadline = startAiDeadline(opts);
  try {
    return await generateStructured({
      operation: featureLabel,
      schema: opts.schema,
      system: opts.system,
      prompt: opts.prompt,
      ...(opts.maxOutputTokens !== undefined && { maxOutputTokens: opts.maxOutputTokens }),
      signal: deadline.signal,
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (isAbortError(err)) {
      // 504, not the code's default 502: the upstream did not fail, we stopped waiting for it. A
      // distinct status is what lets a client tell "retry may help" from "this model is broken".
      const reason = deadline.expired()
        ? `did not finish within ${deadline.budgetMs}ms`
        : "was cancelled";
      throw new AppError("UPSTREAM_ERROR", `${featureLabel} ${reason}`, 504);
    }
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
    const ref = getLogContext()?.requestId ?? randomUUID();
    const name = err instanceof Error ? err.name : "UnknownError";
    const statusCode = APICallError.isInstance(err) ? err.statusCode : undefined;
    logger.error("ai.generation.failed", {
      ref,
      feature: featureLabel,
      errorType: name,
      statusCode,
    });
    throw new AppError("EXTRACTION_FAILED", `${featureLabel} could not be generated (ref: ${ref})`);
  }
}
