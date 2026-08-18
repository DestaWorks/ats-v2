import "server-only";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import type { ZodType } from "zod";
import { AI_MODEL, AI_MODEL_FALLBACK, parseModel, type AiProvider } from "./config";
import { aiUsageEventRepository } from "@/server/repositories/ai-usage-event.repository";

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
  opts: { schema: ZodType<T>; system: string; prompt: string; maxOutputTokens?: number },
) {
  const { provider, modelId } = parseModel(modelString);
  const { object, usage } = await generateObject({
    model: resolveModel(provider, modelId),
    schema: opts.schema,
    system: opts.system,
    prompt: opts.prompt,
    maxOutputTokens: opts.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    providerOptions: providerOptionsFor(provider),
  });
  return { object, provider, modelId, usage };
}

function logUsage(
  operation: string,
  provider: string,
  model: string,
  startedAt: number,
  outcome:
    | { status: "success"; inputTokens?: number; outputTokens?: number }
    | { status: "error"; errorName?: string; errorStatusCode?: number },
) {
  void aiUsageEventRepository.record({
    operation,
    provider,
    model,
    latencyMs: Date.now() - startedAt,
    ...(outcome.status === "success"
      ? { status: "success", inputTokens: outcome.inputTokens, outputTokens: outcome.outputTokens }
      : {
          status: "error",
          errorName: outcome.errorName,
          errorStatusCode: outcome.errorStatusCode,
        }),
  });
}

function parseFallbackModel(
  primaryModel: string,
): { provider: AiProvider; modelId: string } | null {
  if (!AI_MODEL_FALLBACK || AI_MODEL_FALLBACK === primaryModel) return null;
  try {
    return parseModel(AI_MODEL_FALLBACK);
  } catch {
    return null;
  }
}

export async function generateStructured<T>(opts: {
  operation: string;
  schema: ZodType<T>;
  system: string;
  prompt: string;
  /** Override the configured model (`"provider/model"`). Defaults to `AI_MODEL`. */
  model?: string;
  maxOutputTokens?: number;
}): Promise<T> {
  const primaryModel = opts.model ?? AI_MODEL;
  const { provider: primaryProvider, modelId: primaryModelId } = parseModel(primaryModel);
  const startedAt = Date.now();
  try {
    const result = await attempt(primaryModel, opts);
    logUsage(opts.operation, result.provider, result.modelId, startedAt, {
      status: "success",
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    });
    return result.object;
  } catch (primaryErr) {
    logUsage(opts.operation, primaryProvider, primaryModelId, startedAt, {
      status: "error",
      errorName: primaryErr instanceof Error ? primaryErr.name : "UnknownError",
      errorStatusCode: statusCodeOf(primaryErr),
    });

    const fallback = parseFallbackModel(primaryModel);
    if (!fallback) throw primaryErr;

    const fallbackStartedAt = Date.now();
    try {
      const result = await attempt(AI_MODEL_FALLBACK!, opts);
      logUsage(opts.operation, result.provider, result.modelId, fallbackStartedAt, {
        status: "success",
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      });
      return result.object;
    } catch (fallbackErr) {
      logUsage(opts.operation, fallback.provider, fallback.modelId, fallbackStartedAt, {
        status: "error",
        errorName: fallbackErr instanceof Error ? fallbackErr.name : "UnknownError",
        errorStatusCode: statusCodeOf(fallbackErr),
      });
      throw fallbackErr;
    }
  }
}

function statusCodeOf(err: unknown): number | undefined {
  return typeof err === "object" && err !== null && "statusCode" in err
    ? (err as { statusCode?: number }).statusCode
    : undefined;
}
