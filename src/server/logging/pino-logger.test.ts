import { describe, it, expect } from "vitest";

/**
 * The Node adapter's half of the Phase 0.9 guarantee: Pino's own `redact` strips PII/PHI BEFORE
 * serialization, so a candidate object handed to a log call can never reach stdout.
 */

import { createPinoLogger } from "./pino-logger";

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

function capture(level = "debug") {
  const lines: string[] = [];
  const log = createPinoLogger({
    level,
    destination: {
      write(chunk: string) {
        lines.push(chunk.trim());
      },
    },
  });
  return { lines, log, text: () => lines.join("\n") };
}

describe("pino adapter", () => {
  it("does not emit the email or license number of a logged candidate", () => {
    const { log, text } = capture();
    log.error("candidate.save.failed", { candidate: CANDIDATE });
    expect(text()).not.toContain("jane.doe@example.com");
    expect(text()).not.toContain("RN-987654");
    expect(text()).not.toContain("Jane Doe");
    expect(text()).not.toContain("1984-02-11");
    expect(text()).toContain("[Redacted]");
    expect(text()).toContain("cand_123");
  });

  it("redacts several levels deep", () => {
    const { log, text } = capture();
    log.info("import.batch.completed", { page: { rows: { first: CANDIDATE } } });
    expect(text()).not.toContain("jane.doe@example.com");
  });

  it("emits structured JSON with level, msg and correlation fields", () => {
    const { lines, log } = capture();
    log.info("api.request.completed", { requestId: "r-1", userId: "u-1", durationMs: 7 });
    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(parsed.level).toBe(30);
    expect(parsed.msg).toBe("api.request.completed");
    expect(parsed.requestId).toBe("r-1");
    expect(parsed.userId).toBe("u-1");
    expect(parsed.durationMs).toBe(7);
  });

  it("reduces an Error field to its type, never its message", () => {
    const { log, text } = capture();
    log.error("db.query.failed", { err: new Error("Unique constraint failed on jane.doe@x.com") });
    expect(text()).not.toContain("jane.doe@x.com");
    expect(text()).toContain('"type":"Error"');
  });

  it("honours the level threshold", () => {
    const { lines, log } = capture("warn");
    log.debug("noise");
    log.info("noise");
    log.warn("kept");
    expect(lines).toHaveLength(1);
  });

  it("carries child bindings onto every line", () => {
    const { lines, log } = capture();
    log.child({ requestId: "r-2" }).error("api.request.failed", { status: 500 });
    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(parsed.requestId).toBe("r-2");
    expect(parsed.status).toBe(500);
  });
});
