import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import type { ZodType } from "zod";
import { AI_MODEL, AI_MODEL_FALLBACK, parseModel, type AiProvider } from "./config";
import { aiUsageEventRepository } from "@destaworks/db/repositories/ai-usage-event.repository";
import { systemContextFor } from "@destaworks/domain/system-context";

/**
 * Provider-agnostic structured generation. One `generateObject` call over the Vercel AI SDK; the
 * concrete provider (Claude / OpenAI / Gemini / …) is resolved from the `"provider/model"` string.
 * Callers pass a zod schema and get validated data back — they never see the provider.
 */
function resolveModel(provider: AiProvider, modelId: string) {
  switch (provider) {
    case "anthropic":
      return anthropic(modelId);
    case "openai":
      return openai(modelId);
    case "google":
      return google(modelId);
  }
}

/**
 * Explicit output cap so provider-swaps stay safe: some models default to a low `maxOutputTokens`
 * (~4k) which would truncate a rich prescriber resume → validation failure. 16k fits the schema.
 */
const DEFAULT_MAX_OUTPUT_TOKENS = 16000;

/**
 * Google's newer Gemini models ("-latest" aliases, 3.x) think by default, spending part of
 * `maxOutputTokens` on an invisible reasoning pass before the actual JSON — callers with a tight
 * cap (e.g. Pipeline Health's 512) got silently truncated mid-response after the AI_MODEL swap to
 * `gemini-flash-latest`. `thinkingLevel: "low"` keeps the low caps meaningful again; Claude/
 * OpenAI have no such option, so this only applies for the google provider.
 */
function providerOptionsFor(provider: AiProvider) {
  return provider === "google"
    ? { google: { thinkingConfig: { thinkingLevel: "low" } } }
    : undefined;
}

async function attempt<T>(
  modelString: string,
  opts: {
    schema: ZodType<T>;
    system: string;
    prompt: string;
    maxOutputTokens?: number;
    signal?: AbortSignal;
  },
) {
  const { provider, modelId } = parseModel(modelString);
  const providerOptions = providerOptionsFor(provider);
  const { object, usage } = await generateObject({
    model: resolveModel(provider, modelId),
    schema: opts.schema,
    system: opts.system,
    prompt: opts.prompt,
    maxOutputTokens: opts.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    // The deadline reaches the provider's `fetch` through here, so an expired budget cancels the
    // in-flight HTTP request instead of being noticed after it finally returns. The SDK also
    // watches it between retries, which is what stops a 2s/4s backoff outliving the budget.
    ...(opts.signal !== undefined && { abortSignal: opts.signal }),
    ...(providerOptions !== undefined && { providerOptions }),
  });
  return { object, provider, modelId, usage };
}

function logUsage(
  tenantId: string,
  operation: string,
  provider: string,
  model: string,
  startedAt: number,
  outcome:
    | { status: "success"; inputTokens?: number; outputTokens?: number }
    | { status: "error"; errorName?: string; errorStatusCode?: number },
) {
  void aiUsageEventRepository.record(systemContextFor(tenantId), {
    operation,
    provider,
    model,
    latencyMs: Date.now() - startedAt,
    ...(outcome.status === "success"
      ? {
          status: "success" as const,
          ...(outcome.inputTokens !== undefined && { inputTokens: outcome.inputTokens }),
          ...(outcome.outputTokens !== undefined && { outputTokens: outcome.outputTokens }),
        }
      : {
          status: "error" as const,
          ...(outcome.errorName !== undefined && { errorName: outcome.errorName }),
          ...(outcome.errorStatusCode !== undefined && {
            errorStatusCode: outcome.errorStatusCode,
          }),
        }),
  });
}

function parseFallbackModel(
  primaryModel: string,
): { model: string; provider: AiProvider; modelId: string } | null {
  const model = AI_MODEL_FALLBACK;
  if (!model || model === primaryModel) return null;
  try {
    return { model, ...parseModel(model) };
  } catch {
    return null;
  }
}

export async function generateStructured<T>(opts: {
  tenantId: string;
  operation: string;
  schema: ZodType<T>;
  system: string;
  prompt: string;
  /** Override the configured model (`"provider/model"`). Defaults to `AI_MODEL`. */
  model?: string;
  maxOutputTokens?: number;
  /**
   * Cancels the whole operation — both models and every retry inside each. Supplied by
   * `generateAi`, which starts the budget; see `./deadline`.
   */
  signal?: AbortSignal;
}): Promise<T> {
  const primaryModel = opts.model ?? AI_MODEL;
  const { provider: primaryProvider, modelId: primaryModelId } = parseModel(primaryModel);
  const startedAt = Date.now();
  try {
    const result = await attempt(primaryModel, opts);
    logUsage(opts.tenantId, opts.operation, result.provider, result.modelId, startedAt, {
      status: "success",
      ...usageTokens(result.usage),
    });
    return result.object;
  } catch (primaryErr) {
    logUsage(opts.tenantId, opts.operation, primaryProvider, primaryModelId, startedAt, {
      status: "error",
      errorName: primaryErr instanceof Error ? primaryErr.name : "UnknownError",
      ...errorStatus(primaryErr),
    });

    // A blown deadline (or a cancelled caller) must NOT buy a second model. The fallback exists for
    // a provider that is down, and it costs another three attempts plus their backoff — spending
    // that after the budget is gone is precisely the unbounded retry this phase removes.
    if (opts.signal?.aborted === true) throw primaryErr;

    const fallback = parseFallbackModel(primaryModel);
    if (!fallback) throw primaryErr;

    const fallbackStartedAt = Date.now();
    try {
      const result = await attempt(fallback.model, opts);
      logUsage(opts.tenantId, opts.operation, result.provider, result.modelId, fallbackStartedAt, {
        status: "success",
        ...usageTokens(result.usage),
      });
      return result.object;
    } catch (fallbackErr) {
      logUsage(
        opts.tenantId,
        opts.operation,
        fallback.provider,
        fallback.modelId,
        fallbackStartedAt,
        {
          status: "error",
          errorName: fallbackErr instanceof Error ? fallbackErr.name : "UnknownError",
          ...errorStatus(fallbackErr),
        },
      );
      throw fallbackErr;
    }
  }
}

function statusCodeOf(err: unknown): number | undefined {
  return typeof err === "object" && err !== null && "statusCode" in err
    ? (err as { statusCode?: number }).statusCode
    : undefined;
}

function errorStatus(err: unknown): { errorStatusCode?: number } {
  const errorStatusCode = statusCodeOf(err);
  return errorStatusCode === undefined ? {} : { errorStatusCode };
}

function usageTokens(usage: {
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
}) {
  return {
    ...(usage.inputTokens !== undefined && { inputTokens: usage.inputTokens }),
    ...(usage.outputTokens !== undefined && { outputTokens: usage.outputTokens }),
  };
}
