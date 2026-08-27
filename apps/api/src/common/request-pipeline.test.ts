import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { defer, throwError } from "rxjs";
import { z } from "zod";

/**
 * The three cross-cutting classes wired the way the scaffold will register them
 * (RequestId -> Logging -> handler -> ApiExceptionFilter), asserting the guarantees that only
 * hold END TO END and that `apiHandler` gives today in one function:
 *
 *  - an unexpected error's message reaches NEITHER the response NOR the log line;
 *  - the `ref` the client is handed IS the `requestId` on that single log line;
 *  - a failing request produces exactly one line, at the level its outcome deserves.
 */

// `server-only` throws outside an RSC build; neutralize it for the unit test.
vi.mock("server-only", () => ({}));

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@sentry/node", () => ({ captureException }));

import { createConsoleLogger, setLoggerAdapter } from "@destaworks/config/logger";
import { AppError } from "@destaworks/integrations/http/app-error";
import { ApiExceptionFilter } from "./filters/api-exception.filter";
import { LoggingInterceptor } from "./interceptors/logging.interceptor";
import { RequestIdInterceptor } from "./interceptors/request-id.interceptor";
import { fakeCallHandler, fakeHttpContext, RecordingResponse } from "./testing/nest-host";

interface Line {
  level: string;
  msg: string;
  status?: number;
  requestId?: string;
}

interface Envelope {
  error: {
    code: string;
    message: string;
    issues?: { path: string; message: string }[];
    ref?: string;
  };
}

const raw: string[] = [];

beforeEach(() => {
  raw.length = 0;
  captureException.mockClear();
  setLoggerAdapter(createConsoleLogger({ level: "debug", write: (line) => void raw.push(line) }));
});

afterEach(() => {
  setLoggerAdapter(createConsoleLogger());
});

/** Runs one request through the real interceptor chain and, on failure, the real filter. */
async function request(handler: () => unknown, url = "/api/candidates?q=Jane%20Doe") {
  const req: object = { method: "POST", url };
  const res = new RecordingResponse();
  res.status(200);
  const context = fakeHttpContext(req, res);

  const logging = new LoggingInterceptor();
  const requestId = new RequestIdInterceptor();
  const filter = new ApiExceptionFilter();

  const chain = requestId.intercept(
    context,
    fakeCallHandler(() =>
      logging.intercept(
        context,
        fakeCallHandler(() => defer(async () => handler())),
      ),
    ),
  );

  await new Promise<void>((resolve) => {
    chain.subscribe({
      next: () => {},
      error: (err: unknown) => {
        filter.catch(err, context);
        resolve();
      },
      complete: () => resolve(),
    });
  });

  return {
    status: res.statusCode,
    body: res.body as Envelope | undefined,
    lines: raw.map((line) => JSON.parse(line) as Line),
    logged: raw.join("\n"),
  };
}

describe("request pipeline — RequestId + Logging + ApiExceptionFilter", () => {
  it("returns the data path untouched and logs one info line", async () => {
    const result = await request(() => ({ items: [] }));
    expect(result.body).toBeUndefined();
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]?.level).toBe("info");
    expect(result.lines[0]?.msg).toBe("api.request.completed");
    expect(typeof result.lines[0]?.requestId).toBe("string");
  });

  it("hides an unexpected error's message from BOTH the response and the log line", async () => {
    const result = await request(() => {
      throw new Error("Unique constraint failed on jane.doe@example.com");
    });
    expect(result.status).toBe(500);
    expect(JSON.stringify(result.body)).not.toContain("jane.doe@example.com");
    expect(result.logged).not.toContain("jane.doe@example.com");
    expect(result.body?.error).toMatchObject({
      code: "INTERNAL",
      message: "Internal server error",
    });
  });

  it("hands the client a `ref` that IS the requestId on the single logged line", async () => {
    const result = await request(() => {
      throw new Error("boom");
    });
    expect(result.lines).toHaveLength(1);
    const [line] = result.lines;
    expect(line?.msg).toBe("api.request.failed");
    expect(line?.level).toBe("error");
    expect(line?.status).toBe(500);
    expect(line?.requestId).toBe(result.body?.error.ref);
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { requestId: line?.requestId },
    });
  });

  it("never lets the query string into the log line", async () => {
    const result = await request(() => {
      throw new Error("boom");
    }, "/api/candidates?q=Jane%20Doe");
    expect(result.logged).not.toContain("Jane");
    expect(result.logged).toContain('"route":"/api/candidates"');
  });

  it("carries an AppError through as its own status and code, at debug, unreported", async () => {
    const result = await request(() => {
      throw new AppError("STAGE_BLOCKED", "Candidate has no license on file");
    });
    expect(result.status).toBe(422);
    expect(result.body).toEqual({
      error: { code: "STAGE_BLOCKED", message: "Candidate has no license on file" },
    });
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]?.level).toBe("debug");
    expect(captureException).not.toHaveBeenCalled();
  });

  it("carries a ZodError through as 422 + issues, at debug, unreported", async () => {
    const parsed = z.object({ email: z.email() }).safeParse({ email: "nope" });
    const result = await request(() => {
      if (!parsed.success) throw parsed.error;
      throw new Error("schema unexpectedly accepted");
    });
    expect(result.status).toBe(422);
    expect(result.body?.error.code).toBe("BAD_REQUEST");
    expect(result.body?.error.issues?.[0]?.path).toBe("email");
    expect(result.lines[0]?.level).toBe("debug");
    expect(result.lines[0]?.msg).toBe("api.request.invalid");
    expect(captureException).not.toHaveBeenCalled();
  });
});

describe("rxjs error paths", () => {
  it("treats an observable that errors the same as a thrown value", async () => {
    const res = new RecordingResponse();
    const context = fakeHttpContext({ method: "GET", url: "/api/x" }, res);
    const filter = new ApiExceptionFilter();
    const chain = new RequestIdInterceptor().intercept(
      context,
      fakeCallHandler(() =>
        new LoggingInterceptor().intercept(
          context,
          fakeCallHandler(() => throwError(() => new AppError("NOT_FOUND", "gone"))),
        ),
      ),
    );
    await new Promise<void>((resolve) => {
      chain.subscribe({
        next: () => {},
        error: (err: unknown) => {
          filter.catch(err, context);
          resolve();
        },
        complete: () => resolve(),
      });
    });
    expect(res.statusCode).toBe(404);
    expect(raw).toHaveLength(1);
  });
});
