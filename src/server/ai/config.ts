import "server-only";

/**
 * Provider-agnostic AI config. The model is a `"provider/model"` string, so we can switch between
 * Claude, OpenAI (GPT), and Google (Gemini) — and add more — with ONE env var, no code change.
 * Everything downstream (extraction, routes, review UI) depends only on the zod contract, never on
 * the provider. Keys live server-side only (STACK §13).
 */

export const AI_PROVIDERS = ["anthropic", "openai", "google"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

/** e.g. `anthropic/claude-opus-4-8` · `openai/gpt-5` · `google/gemini-2.5-pro`. */
export const AI_MODEL = process.env.AI_MODEL ?? "anthropic/claude-opus-4-8";

/** Which env var holds each provider's key. */
const PROVIDER_KEY_ENV: Record<AiProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
};

/** Split a `"provider/model"` string; throws on an unknown provider or missing model id. */
export function parseModel(model: string = AI_MODEL): { provider: AiProvider; modelId: string } {
  const slash = model.indexOf("/");
  const provider = slash > 0 ? model.slice(0, slash) : "";
  const modelId = slash > 0 ? model.slice(slash + 1) : "";
  if (!(AI_PROVIDERS as readonly string[]).includes(provider) || !modelId) {
    throw new Error(
      `Invalid AI_MODEL "${model}" — expected "provider/model" where provider is one of ${AI_PROVIDERS.join(", ")}.`,
    );
  }
  return { provider: provider as AiProvider, modelId };
}

/** The résumé feature is enabled iff the configured provider's API key is present. */
export const resumeExtractionEnabled: boolean = (() => {
  try {
    return Boolean(process.env[PROVIDER_KEY_ENV[parseModel().provider]]);
  } catch {
    return false;
  }
})();
