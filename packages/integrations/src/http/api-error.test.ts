import { describe, expect, it } from "vitest";
import { classifyError, errorLogEntry } from "./api-error";
import { AppError } from "./app-error";

/** What Prisma throws when the pool cannot hand out a connection in time. */
function prismaError(code: string) {
  const err = new Error("Timed out fetching a new connection from the connection pool");
  err.name = "PrismaClientKnownRequestError";
  return Object.assign(err, { code });
}

describe("classifyError — pool exhaustion", () => {
  it("answers 503, not 500, when a transaction could not get a connection", () => {
    // P2028 at exactly the 2s transaction maxWait is what the overload ramp produced: 460 of these
    // were served as 500s, which reads as "this request is broken" rather than "come back".
    expect(classifyError(prismaError("P2028"))).toEqual({
      kind: "app",
      status: 503,
      code: "OVERLOADED",
      message: "The server is busy. Please try again.",
    });
  });

  it("answers 503 for the pool-checkout timeout as well", () => {
    expect(classifyError(prismaError("P2024"))).toMatchObject({ status: 503, code: "OVERLOADED" });
  });

  it("leaves every other Prisma error a 500 — a unique violation is not an overload", () => {
    const classified = classifyError(prismaError("P2002"));
    expect(classified).toMatchObject({ kind: "unexpected", status: 500, code: "INTERNAL" });
  });

  it("does not reclassify an AppError that already decided its status", () => {
    const classified = classifyError(new AppError("NOT_FOUND", "Candidate not found"));
    expect(classified).toMatchObject({ kind: "app", status: 404, code: "NOT_FOUND" });
  });

  it("says nothing about the database in the client-facing message", () => {
    const { message } = classifyError(prismaError("P2028"));
    expect(message).not.toMatch(/prisma|connection pool|postgres/i);
  });
});

describe("errorLogEntry — level by who is at fault", () => {
  const ctx = { method: "GET", route: "/candidates", durationMs: 2001 };

  it("logs an overload at warn, so production does not shed load silently", () => {
    const entry = errorLogEntry(classifyError(prismaError("P2028")), ctx);
    expect(entry).toMatchObject({
      level: "warn",
      event: "api.request.rejected",
      fields: { status: 503, errorCode: "OVERLOADED" },
    });
  });

  it("leaves a 4xx at debug — a 404 is the caller's problem, not an incident", () => {
    const entry = errorLogEntry(classifyError(new AppError("NOT_FOUND", "nope")), ctx);
    expect(entry).toMatchObject({ level: "debug", fields: { status: 404 } });
  });

  it("still reports an unexpected error at error level", () => {
    const entry = errorLogEntry(classifyError(new Error("boom")), ctx);
    expect(entry).toMatchObject({ level: "error", event: "api.request.failed" });
  });
});
