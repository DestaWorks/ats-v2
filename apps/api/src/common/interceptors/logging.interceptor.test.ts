import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { of, throwError, type Observable } from "rxjs";
import { z } from "zod";
import { createConsoleLogger, setLoggerAdapter, type LogLevel } from "@destaworks/config/logger";
import { AppError } from "@destaworks/integrations/http/app-error";
import { LoggingInterceptor } from "./logging.interceptor";
import { fakeCallHandler, fakeHttpContext, RecordingResponse } from "../testing/nest-host";

/**
 * Proves the one-line-per-request contract (SAAS-RESTRUCTURE-PLAN 4.2): the fields it carries, the
 * level per outcome, and the two things it must never carry — the query string (which can hold a
 * candidate name typed into search) and an unexpected error's message.
 */

interface Line {
  level: LogLevel;
  msg: string;
  method?: string;
  route?: string;
  status?: number;
  durationMs?: number;
  errorCode?: string;
  errorType?: string;
  issueCount?: number;
  requestId?: string;
}

const raw: string[] = [];

beforeEach(() => {
  raw.length = 0;
  // The REAL console adapter with a capture sink, not a stub: the "message never reaches the log"
  // assertions then run against the serializer that actually writes the line in production.
  setLoggerAdapter(createConsoleLogger({ level: "debug", write: (line) => void raw.push(line) }));
});

afterEach(() => {
  setLoggerAdapter(createConsoleLogger());
});

const lines = (): Line[] => raw.map((line) => JSON.parse(line) as Line);

async function observe(source: () => Observable<unknown>, url = "/api/candidates"): Promise<void> {
  const response = new RecordingResponse();
  response.status(200);
  const context = fakeHttpContext({ method: "GET", url }, response);
  const result = new LoggingInterceptor().intercept(context, fakeCallHandler(source));
  await new Promise<void>((resolve) => {
    result.subscribe({ next: () => {}, error: () => resolve(), complete: () => resolve() });
  });
}

describe("LoggingInterceptor", () => {
  it("emits one info line per completed request with method, route, status and durationMs", async () => {
    await observe(() => of({ items: [] }));
    expect(lines()).toHaveLength(1);
    const [line] = lines();
    expect(line?.level).toBe("info");
    expect(line?.msg).toBe("api.request.completed");
    expect(line?.method).toBe("GET");
    expect(line?.route).toBe("/api/candidates");
    expect(line?.status).toBe(200);
    expect(typeof line?.durationMs).toBe("number");
  });

  it("logs the pathname only — the query string can carry a typed-in candidate name", async () => {
    await observe(() => of({ items: [] }), "/api/candidates?q=Jane%20Doe&email=jane%40example.com");
    expect(lines()[0]?.route).toBe("/api/candidates");
    expect(raw.join("\n")).not.toContain("Jane");
    expect(raw.join("\n")).not.toContain("example.com");
  });

  it("logs a rejected AppError at debug — control flow, not an incident", async () => {
    await observe(() => throwError(() => new AppError("FORBIDDEN", "nope")));
    expect(lines()).toHaveLength(1);
    const [line] = lines();
    expect(line?.level).toBe("debug");
    expect(line?.msg).toBe("api.request.rejected");
    expect(line?.status).toBe(403);
    expect(line?.errorCode).toBe("FORBIDDEN");
  });

  it("logs a ZodError at debug with an issue COUNT, never the issues themselves", async () => {
    const parsed = z.object({ email: z.email() }).safeParse({ email: "jane@example.com!" });
    const zodError = parsed.success ? new Error("schema unexpectedly accepted") : parsed.error;
    await observe(() => throwError(() => zodError));
    expect(lines()).toHaveLength(1);
    const [line] = lines();
    expect(line?.level).toBe("debug");
    expect(line?.msg).toBe("api.request.invalid");
    expect(line?.status).toBe(422);
    expect(line?.issueCount).toBe(1);
    expect(raw.join("\n")).not.toContain("jane@example.com");
  });

  it("logs an unexpected error at error, with its TYPE and never its message", async () => {
    await observe(() => throwError(() => new Error("secret leak")));
    expect(lines()).toHaveLength(1);
    const [line] = lines();
    expect(line?.level).toBe("error");
    expect(line?.msg).toBe("api.request.failed");
    expect(line?.status).toBe(500);
    expect(line?.errorType).toBe("Error");
    expect(raw.join("\n")).not.toContain("secret leak");
  });

  it("emits exactly one line for a handler that yields more than once", async () => {
    await observe(() => of(1, 2, 3));
    expect(lines()).toHaveLength(1);
  });
});
