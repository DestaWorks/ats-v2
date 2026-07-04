import "server-only";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import type { ZodType } from "zod";
import { AI_MODEL, parseModel, type AiProvider } from "./config";

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
 * (~4k) which would truncate a rich prescriber résumé → validation failure. 16k fits the schema.
 */
const DEFAULT_MAX_OUTPUT_TOKENS = 16000;

export async function generateStructured<T>(opts: {
  schema: ZodType<T>;
  system: string;
  prompt: string;
  /** Override the configured model (`"provider/model"`). Defaults to `AI_MODEL`. */
  model?: string;
  maxOutputTokens?: number;
}): Promise<T> {
  const { provider, modelId } = parseModel(opts.model ?? AI_MODEL);
  const { object } = await generateObject({
    model: resolveModel(provider, modelId),
    schema: opts.schema,
    system: opts.system,
    prompt: opts.prompt,
    maxOutputTokens: opts.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
  });
  return object;
}
