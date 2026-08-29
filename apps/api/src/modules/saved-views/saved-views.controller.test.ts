import "reflect-metadata";
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Contract test for `/saved-views`: each handler on `SavedViewsController` is driven through its
 * own declared guards, the handler, and the exception filter — success, refusal, and service
 * failure alike — and the resulting `{ status, body }` asserted against the wire contract.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  list: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/config/request-context", () => ({
  requestContext: () => ({ headers: async () => new Headers(), cookie: async () => undefined }),
  installRequestContext: () => {},
}));
vi.mock("@destaworks/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@destaworks/db/memberships", async () => ({
  membershipReader: (
    await import("@destaworks/auth/testing/membership-double")
  ).singleTenantMembershipReader(() => h.session),
}));
vi.mock("@destaworks/db/prisma", () => ({ prisma: {} }));
vi.mock("@destaworks/application/saved-view.service", () => ({
  savedViewService: { list: h.list, create: h.create, remove: h.remove },
}));

import { AppError } from "@destaworks/integrations/http/app-error";
import { savedViewService } from "@destaworks/application/saved-view.service";
import type { AuthContext } from "@destaworks/auth/guards";
import {
  savedViewListQuerySchema,
  type SavedViewDTO,
} from "@destaworks/contracts/validation/saved-view";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { guardOutcome, handlerOutcome, routeSurface } from "../../common/testing/route-parity";
import { SavedViewsController } from "./saved-views.controller";

const controller = new SavedViewsController(savedViewService);

const VIEW: SavedViewDTO = {
  id: "sv1",
  scope: "pipeline",
  name: "My hot list",
  query: "status=3",
  createdAt: "2026-08-01T00:00:00.000Z",
};

const SIGN_IN_REQUIRED = { error: { code: "UNAUTHORIZED", message: "Sign in required" } };

function signIn(role = "Screener"): void {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role } };
}

/** Run the controller's guards; return the user they attached, failing loudly if they refused. */
async function authorize(handlerName: string): Promise<AuthContext> {
  const request: { headers: Record<string, string>; user?: AuthContext } = { headers: {} };
  const refusal = await guardOutcome(SavedViewsController, handlerName, request);
  expect(refusal).toBeNull();
  if (!request.user) throw new Error("guards passed without attaching a user");
  return request.user;
}

beforeEach(() => {
  h.session = null;
  h.list.mockReset();
  h.create.mockReset();
  h.remove.mockReset();
});

describe("GET /saved-views", () => {
  it("is registered at the verb, path, status and gate the endpoint declares", () => {
    expect(routeSurface(SavedViewsController, "list")).toEqual({
      method: "GET",
      path: "/saved-views",
      status: 200,
      capability: undefined,
      guards: ["SessionAuthGuard"],
    });
  });

  it("answers the caller's views for the requested scope", async () => {
    signIn();
    h.list.mockResolvedValue([VIEW]);
    const user = await authorize("list");
    const fromController = await handlerOutcome(SavedViewsController, "list", () =>
      controller.list({ scope: "pipeline" }, user),
    );

    expect(fromController.status).toBe(200);
    expect(fromController.body).toEqual({ savedViews: [VIEW] });
  });

  it("refuses an unauthenticated caller", async () => {
    const fromController = await guardOutcome(SavedViewsController, "list", { headers: {} });

    expect(fromController?.status).toBe(401);
    expect(fromController?.body).toEqual(SIGN_IN_REQUIRED);
    expect(h.list).not.toHaveBeenCalled();
  });

  it("rejects a missing scope with a 422 envelope", async () => {
    signIn();
    const user = await authorize("list");
    const pipe = new ZodValidationPipe(savedViewListQuerySchema);
    const fromController = await handlerOutcome(SavedViewsController, "list", () =>
      controller.list(pipe.transform({}), user),
    );

    expect(fromController.status).toBe(422);
    expect(fromController.body).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Validation failed",
        issues: [{ path: "scope", message: expect.any(String) as unknown as string }],
      },
    });
    expect(h.list).not.toHaveBeenCalled();
  });
});

describe("POST /saved-views", () => {
  it("is registered at the verb, path, status and gate the endpoint declares", () => {
    expect(routeSurface(SavedViewsController, "create")).toEqual({
      method: "POST",
      path: "/saved-views",
      status: 201,
      capability: undefined,
      guards: ["SessionAuthGuard"],
    });
  });

  it("answers 201 with the created view", async () => {
    signIn();
    const input = { scope: "pipeline", name: "My hot list", query: "status=3" } as const;
    h.create.mockResolvedValue(VIEW);
    const user = await authorize("create");
    const fromController = await handlerOutcome(SavedViewsController, "create", () =>
      controller.create(input, user),
    );

    expect(fromController.status).toBe(201);
    expect(fromController.body).toEqual({ savedView: VIEW });
  });

  it("maps a duplicate-name conflict to a 409 envelope", async () => {
    signIn();
    const input = { scope: "pipeline", name: "My hot list", query: "status=3" } as const;
    const conflict = (): never => {
      throw new AppError("CONFLICT", "A view by that name already exists");
    };

    h.create.mockImplementation(conflict);
    const user = await authorize("create");
    const fromController = await handlerOutcome(SavedViewsController, "create", () =>
      controller.create(input, user),
    );

    expect(fromController.status).toBe(409);
    expect(fromController.body).toEqual({
      error: { code: "CONFLICT", message: "A view by that name already exists" },
    });
  });
});

describe("DELETE /saved-views/:id", () => {
  it("is registered at the verb, path, status and gate the endpoint declares", () => {
    expect(routeSurface(SavedViewsController, "remove")).toEqual({
      method: "DELETE",
      path: "/saved-views/:id",
      status: 200,
      capability: undefined,
      guards: ["SessionAuthGuard"],
    });
  });

  it("answers the deleted view's id", async () => {
    signIn();
    h.remove.mockResolvedValue({ id: "sv1" });
    const user = await authorize("remove");
    const fromController = await handlerOutcome(SavedViewsController, "remove", () =>
      controller.remove("sv1", user),
    );

    expect(fromController.status).toBe(200);
    expect(fromController.body).toEqual({ id: "sv1" });
  });

  it("maps another user's id to a 404 envelope", async () => {
    signIn();
    const missing = (): never => {
      throw new AppError("NOT_FOUND", "Saved view not found");
    };

    h.remove.mockImplementation(missing);
    const user = await authorize("remove");
    const fromController = await handlerOutcome(SavedViewsController, "remove", () =>
      controller.remove("other", user),
    );

    expect(fromController.status).toBe(404);
    expect(fromController.body).toEqual({
      error: { code: "NOT_FOUND", message: "Saved view not found" },
    });
  });
});
