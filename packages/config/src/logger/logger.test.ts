import { describe, it, expect, beforeEach, afterEach } from "vitest";

/**
 * Proves the two guarantees the logger exists for (Phase 0.9):
 *   1. PII/PHI carried in log fields never reaches the emitted line.
 *   2. Output is structured JSON — never free text with values interpolated in.
 */

import { createConsoleLogger } from "./console-logger";
import { redactFields, isSensitiveKey, PINO_REDACT_PATHS } from "./redact";
import { resolveLevel, isLevelEnabled } from "./types";
import { logger, setLoggerAdapter, registerLogContextProvider } from "./index";

const CANDIDATE = {
  id: "cand_123",
  name: "Jane Doe",
  email: "jane.doe@example.com",
  phone: "+1-555-0100",
  licenseNumber: "RN-987654",
  npi: "1234567890",
  dateOfBirth: "1984-02-11",
  stageCode: "3_INTERVIEW",
};

function capture() {
  const lines: string[] = [];
  const log = createConsoleLogger({ level: "debug", write: (line) => lines.push(line) });
  return { lines, log, text: () => lines.join("\n") };
}

describe("redactFields", () => {
  it("strips every PII/PHI key at the top level", () => {
    const out = redactFields(CANDIDATE) as Record<string, unknown>;
    expect(out.email).toBe("[Redacted]");
    expect(out.phone).toBe("[Redacted]");
    expect(out.licenseNumber).toBe("[Redacted]");
    expect(out.npi).toBe("[Redacted]");
    expect(out.name).toBe("[Redacted]");
    expect(out.dateOfBirth).toBe("[Redacted]");
  });

  it("keeps non-sensitive keys so the line stays diagnosable", () => {
    const out = redactFields(CANDIDATE) as Record<string, unknown>;
    expect(out.id).toBe("cand_123");
    expect(out.stageCode).toBe("3_INTERVIEW");
  });

  it("reaches into nested objects and arrays", () => {
    const out = JSON.stringify(
      redactFields({ page: { rows: [CANDIDATE, { email: "b@example.com" }] } }),
    );
    expect(out).not.toContain("jane.doe@example.com");
    expect(out).not.toContain("b@example.com");
    expect(out).not.toContain("RN-987654");
  });

  it("reduces an Error to its type — never its message", () => {
    const out = redactFields({ err: new TypeError("jane.doe@example.com is invalid") });
    expect(JSON.stringify(out)).not.toContain("jane.doe@example.com");
    expect(out).toEqual({ err: { type: "TypeError" } });
  });

  it("matches keys case-insensitively", () => {
    expect(isSensitiveKey("Email")).toBe(true);
    expect(isSensitiveKey("LicenseNumber")).toBe(true);
    expect(isSensitiveKey("stageCode")).toBe(false);
  });

  it("exports wildcard-expanded paths for Pino's own redactor", () => {
    expect(PINO_REDACT_PATHS).toContain("email");
    expect(PINO_REDACT_PATHS).toContain("*.email");
    expect(PINO_REDACT_PATHS).toContain("*.*.*.licenseNumber");
  });
});

describe("console logger (Edge/browser adapter)", () => {
  it("does not emit the email or license number of a logged candidate", () => {
    const { log, text } = capture();
    log.error("candidate.save.failed", { candidate: CANDIDATE });
    expect(text()).not.toContain("jane.doe@example.com");
    expect(text()).not.toContain("RN-987654");
    expect(text()).not.toContain("Jane Doe");
    expect(text()).toContain("cand_123");
  });

  it("emits one JSON object per line with level, msg and fields", () => {
    const { lines, log } = capture();
    log.info("api.request.completed", { requestId: "r-1", userId: "u-1", durationMs: 12 });
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(parsed.level).toBe("info");
    expect(parsed.msg).toBe("api.request.completed");
    expect(parsed.requestId).toBe("r-1");
    expect(parsed.userId).toBe("u-1");
    expect(parsed.durationMs).toBe(12);
  });

  it("merges child bindings into every subsequent line", () => {
    const { lines, log } = capture();
    log.child({ requestId: "r-2" }).warn("rate_limit.redis.unavailable");
    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(parsed.requestId).toBe("r-2");
    expect(parsed.level).toBe("warn");
  });

  it("drops lines below the configured threshold", () => {
    const lines: string[] = [];
    const log = createConsoleLogger({ level: "warn", write: (line) => lines.push(line) });
    log.debug("noise");
    log.info("noise");
    log.warn("kept");
    expect(lines).toHaveLength(1);
  });
});

describe("level policy", () => {
  it("turns debug off in production and on in development", () => {
    expect(resolveLevel({ NODE_ENV: "production" })).toBe("info");
    expect(isLevelEnabled("debug", resolveLevel({ NODE_ENV: "production" }))).toBe(false);
    expect(isLevelEnabled("debug", resolveLevel({ NODE_ENV: "development" }))).toBe(true);
  });

  it("lets LOG_LEVEL override the default", () => {
    expect(resolveLevel({ NODE_ENV: "production", LOG_LEVEL: "debug" })).toBe("debug");
    expect(resolveLevel({ NODE_ENV: "development", LOG_LEVEL: "silent" })).toBe("silent");
  });
});

describe("logger facade", () => {
  const lines: string[] = [];

  beforeEach(() => {
    lines.length = 0;
    setLoggerAdapter(createConsoleLogger({ level: "debug", write: (line) => lines.push(line) }));
  });

  afterEach(() => {
    registerLogContextProvider(() => undefined);
    setLoggerAdapter(createConsoleLogger());
  });

  it("merges the ambient log context into every line", () => {
    registerLogContextProvider(() => ({ requestId: "req-9", userId: "user-9" }));
    logger.info("service.candidate.moved", { stageCode: "4_OFFER" });
    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(parsed.requestId).toBe("req-9");
    expect(parsed.userId).toBe("user-9");
    expect(parsed.stageCode).toBe("4_OFFER");
  });

  it("redacts through the facade too", () => {
    logger.error("candidate.save.failed", { candidate: CANDIDATE });
    expect(lines.join("\n")).not.toContain("jane.doe@example.com");
  });
});
