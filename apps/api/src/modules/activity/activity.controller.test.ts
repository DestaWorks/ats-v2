import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Contract parity for `GET /activity` and `GET /activity/:id` against the Next.js routes they
 * replace.
 *
 * This is the audit trail, so the denial cases are the point: signed out is 401 and a role without
 * `viewAudit` is 403, on BOTH routes, before the service is reached. The capability asserted here
 * is read off the handler's own decorator — a route that silently declared a weaker one would fail
 * this test rather than pass it.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  listActivity: vi.fn(),
  getActivityDetail: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));
vi.mock("@destaworks/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@destaworks/application/audit.service", () => ({
  auditService: { listActivity: h.listActivity, getActivityDetail: h.getActivityDetail },
}));

import { encodeCursor } from "@destaworks/contracts/validation/cursor";
import { AppError } from "@destaworks/integrations/http/app-error";
import { installNestRequestContext } from "../../common/request-context/nest-request-context";
import type { AuthenticatedRequest } from "../../common/guards/authenticated-request";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import {
  boundPipes,
  injectedTokens,
  renderFailure,
  routeOf,
  runDeclaredGuards,
} from "../../common/testing/route-parity";
import { AUDIT_SERVICE } from "./activity.tokens";
import { ActivityController } from "./activity.controller";

installNestRequestContext();

const PAGE = { items: [], nextCursor: null };

const controller = (): ActivityController =>
  new ActivityController({
    listActivity: h.listActivity,
    getActivityDetail: h.getActivityDetail,
    listAuditForEntity: vi.fn(),
    listActorOptions: vi.fn(),
  });

function guardWith(role: string | null, handlerName: string): Promise<unknown> {
  h.session =
    role === null ? null : { user: { id: "u1", email: "u@desta.works", name: "U", role } };
  return renderFailure(() =>
    runDeclaredGuards(ActivityController, handlerName, { headers: {} } as AuthenticatedRequest),
  );
}

const UNAUTHORIZED = {
  status: 401,
  body: { error: { code: "UNAUTHORIZED", message: "Sign in required" } },
};
const FORBIDDEN = {
  status: 403,
  body: { error: { code: "FORBIDDEN", message: "You don't have permission to do that" } },
};

beforeEach(() => {
  h.session = null;
  h.listActivity.mockReset();
  h.getActivityDetail.mockReset();
});

describe("the activity routes keep the Next.js verbs, paths and gate", () => {
  it("mounts both reads and requires viewAudit on each", () => {
    expect(routeOf(ActivityController, "list")).toEqual({
      method: "GET",
      path: "/activity",
      status: 200,
      capability: "viewAudit",
      guards: ["SessionAuthGuard", "CapabilityGuard"],
    });
    expect(routeOf(ActivityController, "detail")).toEqual({
      method: "GET",
      path: "/activity/:id",
      status: 200,
      capability: "viewAudit",
      guards: ["SessionAuthGuard", "CapabilityGuard"],
    });
  });

  it("injects the audit service by token — never the imported singleton", () => {
    expect(injectedTokens(ActivityController)).toEqual([AUDIT_SERVICE]);
  });
});

describe("GET /activity — denial", () => {
  it("401s signed out on both routes", async () => {
    expect(await guardWith(null, "list")).toEqual(UNAUTHORIZED);
    expect(await guardWith(null, "detail")).toEqual(UNAUTHORIZED);
    expect(h.listActivity).not.toHaveBeenCalled();
    expect(h.getActivityDetail).not.toHaveBeenCalled();
  });

  it("403s a role that does not hold viewAudit, on both routes", async () => {
    expect(await guardWith("Associate", "list")).toEqual(FORBIDDEN);
    expect(await guardWith("Associate", "detail")).toEqual(FORBIDDEN);
    expect(h.listActivity).not.toHaveBeenCalled();
    expect(h.getActivityDetail).not.toHaveBeenCalled();
  });

  it("admits a role that does hold viewAudit", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    const request: AuthenticatedRequest = { headers: {} };
    await runDeclaredGuards(ActivityController, "list", request);
    expect(request.user).toMatchObject({ id: "u1", role: "Owner" });
  });
});

describe("GET /activity — the page", () => {
  it("returns the keyset page and passes the filters through with undefined keys dropped", async () => {
    h.listActivity.mockResolvedValue(PAGE);
    expect(await controller().list({ actor: "u9" })).toEqual(PAGE);
    expect(h.listActivity).toHaveBeenCalledWith({ actor: "u9" }, null);
  });

  it("decodes a valid cursor into the keyset page the service expects", async () => {
    h.listActivity.mockResolvedValue(PAGE);
    const cursor = encodeCursor({ at: new Date("2026-01-01T00:00:00.000Z"), id: "a1" }, "at_desc");
    await controller().list({ cursor });
    expect(h.listActivity).toHaveBeenCalledWith({}, expect.objectContaining({ id: "a1" }));
  });

  it("answers 400 BAD_REQUEST for a malformed cursor, exactly as the Next.js route does", async () => {
    expect(await renderFailure(() => controller().list({ cursor: "not-a-cursor" }))).toEqual({
      status: 400,
      body: { error: { code: "BAD_REQUEST", message: "Invalid cursor" } },
    });
    expect(h.listActivity).not.toHaveBeenCalled();
  });

  it("validates the query with the contract schema, answering 422 + issues", async () => {
    const [pipe] = boundPipes(ActivityController, "list");
    expect(pipe).toBeInstanceOf(ZodValidationPipe);
    expect(await renderFailure(() => pipe?.transform({ entity: "not-an-entity" }))).toMatchObject({
      status: 422,
      body: { error: { code: "BAD_REQUEST", message: "Validation failed" } },
    });
  });
});

describe("GET /activity/:id", () => {
  it("returns the one row's before/after snapshots", async () => {
    const detail = { id: "a1", before: null, after: null };
    h.getActivityDetail.mockResolvedValue(detail);
    expect(await controller().detail("a1")).toEqual(detail);
    expect(h.getActivityDetail).toHaveBeenCalledWith("a1");
  });

  it("answers 404 for an unknown id, with the route's own envelope", async () => {
    h.getActivityDetail.mockRejectedValue(new AppError("NOT_FOUND", "Activity not found"));
    expect(await renderFailure(() => controller().detail("gone"))).toEqual({
      status: 404,
      body: { error: { code: "NOT_FOUND", message: "Activity not found" } },
    });
  });
});
