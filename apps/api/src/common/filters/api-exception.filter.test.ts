import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

/**
 * Proves the NestJS filter serves the SAME error contract as `apiHandler`
 * (SAAS-RESTRUCTURE-PLAN 4.2): typed errors keep their status and envelope, validation errors
 * become 422 + field issues, and an unexpected error is reduced to `INTERNAL` + a `ref` with its
 * message discarded — the security-critical case, since Prisma embeds field VALUES in messages.
 */

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@sentry/node", () => ({ captureException }));

import { AppError } from "@destaworks/integrations/http/app-error";
import { ApiExceptionFilter } from "./api-exception.filter";
import { attachRequestId } from "../http";
import { fakeHttpContext, RecordingResponse } from "../testing/nest-host";

interface Envelope {
  error: {
    code: string;
    message: string;
    issues?: { path: string; message: string }[];
    ref?: string;
  };
}

function run(exception: unknown, requestId?: string) {
  const request: object = {};
  if (requestId !== undefined) attachRequestId(request, requestId);
  const response = new RecordingResponse();
  new ApiExceptionFilter().catch(exception, fakeHttpContext(request, response));
  return { response, body: response.body as Envelope };
}

describe("ApiExceptionFilter", () => {
  beforeEach(() => {
    captureException.mockClear();
  });

  it("maps an AppError to its status + { error: { code, message } }", () => {
    const { response, body } = run(new AppError("FORBIDDEN", "nope"));
    expect(response.statusCode).toBe(403);
    expect(body).toEqual({ error: { code: "FORBIDDEN", message: "nope" } });
  });

  it("keeps an AppError's explicit status override", () => {
    const { response, body } = run(new AppError("UPSTREAM_ERROR", "npi lookup failed", 504));
    expect(response.statusCode).toBe(504);
    expect(body.error.code).toBe("UPSTREAM_ERROR");
  });

  it("maps a ZodError to 422 with field issues", () => {
    const schema = z.object({ email: z.email(), age: z.number() });
    let thrown: unknown;
    try {
      schema.parse({ email: "not-an-email", age: "x" });
    } catch (err) {
      thrown = err;
    }
    const { response, body } = run(thrown);
    expect(response.statusCode).toBe(422);
    expect(body.error.code).toBe("BAD_REQUEST");
    expect(body.error.message).toBe("Validation failed");
    expect(body.error.issues?.some((i) => i.path === "email")).toBe(true);
    expect(body.error.issues?.some((i) => i.path === "age")).toBe(true);
  });

  it("maps an unexpected Error to 500 WITHOUT leaking its message, and returns a ref", () => {
    const { response, body } = run(new Error("secret leak"));
    expect(response.statusCode).toBe(500);
    expect(JSON.stringify(body)).not.toContain("secret leak");
    expect(body.error.code).toBe("INTERNAL");
    expect(body.error.message).toBe("Internal server error");
    expect(typeof body.error.ref).toBe("string");
    expect(body.error.ref?.length).toBeGreaterThan(0);
  });

  it("returns the request's OWN requestId as `ref`, not a second uuid", () => {
    const { body } = run(new Error("boom"), "req-fixed-id");
    expect(body.error.ref).toBe("req-fixed-id");
  });

  it("reports an unexpected error to Sentry tagged with that same requestId", () => {
    const boom = new Error("secret leak");
    const { body } = run(boom, "req-fixed-id");
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(boom, { tags: { requestId: "req-fixed-id" } });
    expect(captureException.mock.calls[0]?.[1]?.tags?.requestId).toBe(body.error.ref);
  });

  it("does NOT report handled AppErrors or validation errors to Sentry", () => {
    run(new AppError("NOT_FOUND", "no such candidate"));
    run(new z.ZodError([]));
    expect(captureException).not.toHaveBeenCalled();
  });

  it("attaches `ref` only to the unexpected branch", () => {
    expect(run(new AppError("CONFLICT", "already applied")).body.error.ref).toBeUndefined();
    expect(run(new z.ZodError([])).body.error.ref).toBeUndefined();
  });
});
