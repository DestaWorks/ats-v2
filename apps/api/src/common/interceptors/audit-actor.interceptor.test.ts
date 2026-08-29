import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { AppError } from "@destaworks/integrations/http/app-error";
import {
  AuditActorInterceptor,
  type AuditActorRequest,
  type ExecutionContextLike,
} from "./audit-actor.interceptor";

const HANDLER_RESULT = Symbol("handler result");

function contextFor(request: AuditActorRequest): ExecutionContextLike {
  // `as unknown as T` reproduces Nest's own `getRequest<T>()`, which is an unchecked assertion by
  // design — the caller names the shape it expects. That is exactly why the interceptor narrows
  // `user` at runtime instead of trusting the declared type.
  return { switchToHttp: () => ({ getRequest: <T>(): T => request as unknown as T }) };
}

function handler() {
  return { handle: vi.fn(() => HANDLER_RESULT) };
}

describe("AuditActorInterceptor", () => {
  describe("a mutation cannot reach a service unattributed", () => {
    it("passes a mutation through when the guard resolved an actor", () => {
      const next = handler();

      const result = new AuditActorInterceptor().intercept(
        contextFor({
          method: "POST",
          user: {
            tenantId: "t1",
            membershipId: "m1",
            user: { id: "usr_1", email: "o@desta.works", name: "O" },
            role: "Owner",
          },
        }),
        next,
      );

      expect(result).toBe(HANDLER_RESULT);
      expect(next.handle).toHaveBeenCalledOnce();
    });

    it.each(["POST", "PUT", "PATCH", "DELETE", "patch"])(
      "rejects an unattributed %s before the handler runs",
      (method) => {
        const next = handler();
        const interceptor = new AuditActorInterceptor();

        // Fail-closed: the service would otherwise write an `activity_log` row it cannot attribute.
        expect(() => interceptor.intercept(contextFor({ method }), next)).toThrow(
          new AppError("UNAUTHORIZED", "Sign in required"),
        );
        expect(next.handle).not.toHaveBeenCalled();
      },
    );

    it.each([
      ["a principal with no identity", {}],
      ["a principal with no id", { user: {} }],
      ["an empty id", { user: { id: "" } }],
      ["a non-string id", { user: { id: 7 } }],
      ["a null identity", { user: null }],
      ["a null principal", null],
      // The pre-6.4 flat shape: an identity at the top level is no longer an actor, and must not
      // be accepted as one by a stale caller that never learned about the tenant context.
      ["the old flat principal", { id: "usr_1", role: "Owner" }],
    ])("rejects %s", (_label, user) => {
      const next = handler();
      const interceptor = new AuditActorInterceptor();

      expect(() => interceptor.intercept(contextFor({ method: "POST", user }), next)).toThrow(
        AppError,
      );
      expect(next.handle).not.toHaveBeenCalled();
    });

    it("rejects with the same code and message `requireUser()` throws today", () => {
      let thrown: unknown;
      try {
        new AuditActorInterceptor().intercept(contextFor({ method: "POST" }), handler());
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(AppError);
      expect(thrown).toMatchObject({
        code: "UNAUTHORIZED",
        message: "Sign in required",
        status: 401,
      });
    });
  });

  describe("reads and declared exemptions", () => {
    it.each(["GET", "HEAD", "OPTIONS"])("lets an unattributed %s through", (method) => {
      const next = handler();

      expect(new AuditActorInterceptor().intercept(contextFor({ method }), next)).toBe(
        HANDLER_RESULT,
      );
      expect(next.handle).toHaveBeenCalledOnce();
    });

    it("lets an unattributed mutation through only when the route declares a reason", () => {
      const next = handler();
      const interceptor = new AuditActorInterceptor({
        reason: "Client portal: the actor is a token-bearing contact, not a signed-in operator.",
      });

      expect(interceptor.intercept(contextFor({ method: "POST" }), next)).toBe(HANDLER_RESULT);
      expect(next.handle).toHaveBeenCalledOnce();
    });
  });

  describe("is structurally a Nest interceptor", () => {
    it("returns whatever the call handler returns, untouched", () => {
      const stream = { subscribe: () => undefined };

      expect(
        new AuditActorInterceptor().intercept(contextFor({ method: "GET" }), {
          handle: () => stream,
        }),
      ).toBe(stream);
    });
  });
});

/* ------------------------------------------------------------------- the audit invariant ---- */

function tsFilesUnder(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "generated") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) tsFilesUnder(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Comments out, line structure kept — so prose ABOUT `writeAudit(…)` is not read as a call. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "\n").replace(/\/\/.*$/gm, "");
}

/**
 * Auditing lives in the services, inside the mutation's transaction — and NOWHERE ELSE. Both
 * halves matter: a transport-layer writer would double every audited mutation, and moving the
 * writes out of the services would break their atomicity with the data they record. This is the
 * invariant the interceptor above deliberately does not violate.
 */
describe("the audit trail is written by the services and only by the services", () => {
  /** `writeAudit(` — the call, not the import line. */
  const CALL = /\bwriteAudit\s*\(/;

  it("the transport layer never writes an audit row", () => {
    const offenders = tsFilesUnder(join("apps", "api", "src"))
      .filter((file) => !/\.(?:test|spec)\.tsx?$/.test(file))
      .filter((file) => CALL.test(code(readFileSync(file, "utf8"))));

    expect(
      offenders,
      `apps/api writes audit rows the services already write — every mutation would be ` +
        `audited twice:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("the application layer still writes them, inside the mutation's transaction", () => {
    let calls = 0;
    let outsideTransaction = 0;

    for (const file of tsFilesUnder(join("packages", "application", "src"))) {
      if (/\.(?:test|spec)\.ts$/.test(file)) continue;
      for (const line of code(readFileSync(file, "utf8")).split("\n")) {
        if (!CALL.test(line)) continue;
        calls += 1;
        // `writeAudit(tx, …)` — the transactional client is always the first argument, so the
        // `activity_log` row commits or rolls back with the mutation it records.
        if (!/\bwriteAudit\s*\(\s*tx\b/.test(line)) outsideTransaction += 1;
      }
    }

    expect(calls).toBeGreaterThanOrEqual(84);
    expect(outsideTransaction).toBe(0);
  });
  describe("a portal contact is a principal, not an exemption", () => {
    it("admits a portal mutation attributed to the cookie-resolved contact", () => {
      const interceptor = new AuditActorInterceptor();
      const run = () =>
        interceptor.intercept(
          contextFor({ method: "POST", portal: { contactId: "contact_1", clientId: "client_1" } }),
          { handle: () => "ok" },
        );
      expect(run()).toBe("ok");
    });

    it("still refuses a portal mutation when the guard resolved nothing", () => {
      const interceptor = new AuditActorInterceptor();
      const run = () =>
        interceptor.intercept(contextFor({ method: "POST", portal: undefined }), {
          handle: () => "ok",
        });
      expect(run).toThrowError(expect.objectContaining({ code: "UNAUTHORIZED" }));
    });

    it("refuses a portal object carrying no contact id", () => {
      const interceptor = new AuditActorInterceptor();
      const run = () =>
        interceptor.intercept(contextFor({ method: "POST", portal: { clientId: "client_1" } }), {
          handle: () => "ok",
        });
      expect(run).toThrowError(expect.objectContaining({ code: "UNAUTHORIZED" }));
    });
  });
});
