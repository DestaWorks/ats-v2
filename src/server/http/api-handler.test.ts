import { describe, it, expect, vi } from "vitest";
import { z } from "zod";

/**
 * Proves the centralized error mapping in `apiHandler` (IMPLEMENTATION-PLAN 0.4): typed
 * errors → the right status + envelope, validation errors → 422 + issues, and — the
 * security-critical case — an unexpected error never leaks its message to the client.
 */

// `server-only` throws outside an RSC build; neutralize it for the unit test.
vi.mock("server-only", () => ({}));

import { apiHandler, json } from "./api-handler";
import { AppError } from "./app-error";

const req = () => new Request("http://localhost/api/test");

describe("apiHandler — centralized error mapping", () => {
  it("maps an AppError to its status + { error: { code, message } }", async () => {
    const handler = apiHandler(async () => {
      throw new AppError("FORBIDDEN", "nope");
    });
    const res = await handler(req(), undefined);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: { code: "FORBIDDEN", message: "nope" } });
  });

  it("maps a ZodError to 422 with field issues", async () => {
    const schema = z.object({ email: z.string().email(), age: z.number() });
    const handler = apiHandler(async () => {
      schema.parse({ email: "not-an-email", age: "x" });
      return json({ ok: true });
    });
    const res = await handler(req(), undefined);
    expect(res.status).toBe(422);
    const body = (await res.json()) as {
      error: { code: string; message: string; issues: { path: string; message: string }[] };
    };
    expect(body.error.code).toBe("BAD_REQUEST");
    expect(Array.isArray(body.error.issues)).toBe(true);
    expect(body.error.issues.length).toBeGreaterThan(0);
    expect(body.error.issues.some((i) => i.path === "email")).toBe(true);
  });

  it("maps a generic Error to 500 WITHOUT leaking its message, and returns a correlation ref", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = apiHandler(async () => {
      throw new Error("secret leak");
    });
    const res = await handler(req(), undefined);
    expect(res.status).toBe(500);
    const text = await res.text();
    // The raw message never reaches the client (response OR the logged line).
    expect(text).not.toContain("secret leak");
    const logged = errSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).not.toContain("secret leak");
    const body = JSON.parse(text) as { error: { code: string; message: string; ref?: string } };
    expect(body.error.code).toBe("INTERNAL");
    expect(body.error.message).toBe("Internal server error");
    // A generated correlation id ties the 500 to its (PII-free) log line.
    expect(typeof body.error.ref).toBe("string");
    expect(body.error.ref!.length).toBeGreaterThan(0);
    errSpy.mockRestore();
  });

  it("returns the data + status on success", async () => {
    const handler = apiHandler(async () => json({ hello: "world" }, 201));
    const res = await handler(req(), undefined);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ hello: "world" });
  });

  it("json() defaults to a 200 status", async () => {
    const res = json({ a: 1 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ a: 1 });
  });
});
