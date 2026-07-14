import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

/**
 * Extraction tests with a MOCKED provider wrapper (never a real LLM call, §8): the feature flag
 * gates the call, validated data flows through, and provider errors map to the right `AppError` by
 * HTTP status (401/403 → FEATURE_DISABLED, 429 → RATE_LIMITED, else EXTRACTION_FAILED). Also asserts
 * the résumé text / structured output is NEVER written to the console. Provider-agnostic: we mock
 * `./provider` (`generateStructured`), so this holds for Claude / OpenAI / Gemini alike.
 */

const SENSITIVE_TEXT =
  "Jane Doe — NPI 1234567890 — license LPC-SECRET-99 — jane.secret@example.com — long enough text";

const h = vi.hoisted(() => {
  // Mirrors the Vercel AI SDK `APICallError` shape used for error mapping.
  class APICallError extends Error {
    statusCode?: number;
    constructor(message: string, statusCode?: number) {
      super(message);
      this.statusCode = statusCode;
    }
    static isInstance(e: unknown): e is APICallError {
      return e instanceof APICallError;
    }
  }
  return { enabled: true, gen: vi.fn(), APICallError };
});

vi.mock("server-only", () => ({}));

vi.mock("@/server/ai/config", () => ({
  get aiEnabled() {
    return h.enabled;
  },
}));

vi.mock("./provider", () => ({ generateStructured: h.gen }));

vi.mock("ai", () => ({ APICallError: h.APICallError }));

import { parseResume } from "./parse-resume";

const input = { variant: "clinical" as const, text: SENSITIVE_TEXT };

let errorSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  h.enabled = true;
  h.gen.mockReset();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
  logSpy.mockRestore();
  warnSpy.mockRestore();
});

/** Assert nothing sensitive (résumé text or extracted output) reached the console. */
function assertNoPiiLogged() {
  for (const spy of [errorSpy, logSpy, warnSpy]) {
    for (const call of spy.mock.calls) {
      const serialized = JSON.stringify(call);
      expect(serialized).not.toContain("LPC-SECRET-99");
      expect(serialized).not.toContain("jane.secret@example.com");
    }
  }
}

describe("parseResume", () => {
  it("throws FEATURE_DISABLED when the key is absent", async () => {
    h.enabled = false;
    await expect(parseResume(input)).rejects.toMatchObject({
      code: "FEATURE_DISABLED",
      status: 503,
    });
    expect(h.gen).not.toHaveBeenCalled();
  });

  it("returns the schema-validated data on success", async () => {
    const parsed = { name: "Jane Doe", email: "jane.secret@example.com" };
    h.gen.mockResolvedValue(parsed);
    const result = await parseResume(input);
    expect(result).toBe(parsed);
    assertNoPiiLogged();
  });

  it("maps a 401/403 provider error → FEATURE_DISABLED", async () => {
    h.gen.mockRejectedValue(new h.APICallError("bad key", 401));
    await expect(parseResume(input)).rejects.toMatchObject({
      code: "FEATURE_DISABLED",
      status: 503,
    });
    assertNoPiiLogged();
  });

  it("maps a 429 provider error → RATE_LIMITED", async () => {
    h.gen.mockRejectedValue(new h.APICallError("slow down", 429));
    await expect(parseResume(input)).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429 });
    assertNoPiiLogged();
  });

  it("maps any other error → EXTRACTION_FAILED without leaking the raw message", async () => {
    h.gen.mockRejectedValue(new Error("raw model body with jane.secret@example.com"));
    await expect(parseResume(input)).rejects.toMatchObject({
      code: "EXTRACTION_FAILED",
      status: 502,
    });
    assertNoPiiLogged();
  });
});
