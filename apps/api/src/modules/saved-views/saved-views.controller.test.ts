import "reflect-metadata";
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Phase 4.3 contract test for `/saved-views`: for each route, the NestJS controller and the
 * Next.js handler it replaces are driven with the same input against the same mocked service, and
 * their `{ status, body }` compared — success, refusal, and service failure alike.
 *
 * Both transports import the SAME `savedViewService` module, so a mock here reaches both; anything
 * the two do differently is transport, which is exactly what is under test.
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
vi.mock("@destaworks/db/prisma", () => ({ prisma: {} }));
vi.mock("@destaworks/application/saved-view.service", () => ({
  savedViewService: { list: h.list, create: h.create, remove: h.remove },
}));

import { AppError } from "@destaworks/integrations/http/app-error";
import { savedViewService } from "@destaworks/application/saved-view.service";
import type { AuthUser } from "@destaworks/auth/guards";
import {
  savedViewListQuerySchema,
  type SavedViewDTO,
} from "@destaworks/contracts/validation/saved-view";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import {
  guardOutcome,
  handlerOutcome,
  routeOutcome,
  routeSurface,
} from "../../common/testing/route-parity";
import { SavedViewsController } from "./saved-views.controller";
import { GET, POST } from "../../../../web/src/app/api/saved-views/route";
import { DELETE } from "../../../../web/src/app/api/saved-views/[id]/route";

const controller = new SavedViewsController(savedViewService);

const VIEW: SavedViewDTO = {
  id: "sv1",
  scope: "pipeline",
  name: "My hot list",
  query: "status=3",
  createdAt: "2026-08-01T00:00:00.000Z",
};

const LIST_URL = "http://localhost/api/saved-views?scope=pipeline";

function signIn(role = "Screener"): void {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role } };
}

/** Run the controller's guards; return the user they attached, failing loudly if they refused. */
async function authorize(handlerName: string): Promise<AuthUser> {
  const request: { headers: Record<string, string>; user?: AuthUser } = { headers: {} };
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
  it("is registered at the verb, path, status and gate the Next route serves", () => {
    expect(routeSurface(SavedViewsController, "list")).toEqual({
      method: "GET",
      path: "/saved-views",
      status: 200,
      capability: undefined,
      guards: ["SessionAuthGuard"],
    });
  });

  it("answers the same body as the Next route", async () => {
    signIn();
    h.list.mockResolvedValue([VIEW]);
    const fromRoute = await routeOutcome(await GET(new Request(LIST_URL), undefined));

    h.list.mockResolvedValue([VIEW]);
    const user = await authorize("list");
    const fromController = await handlerOutcome(SavedViewsController, "list", () =>
      controller.list({ scope: "pipeline" }, user),
    );

    expect(fromController).toEqual(fromRoute);
    expect(fromController.body).toEqual({ savedViews: [VIEW] });
  });

  it("refuses an unauthenticated caller with the same envelope", async () => {
    const fromRoute = await routeOutcome(await GET(new Request(LIST_URL), undefined));
    const fromController = await guardOutcome(SavedViewsController, "list", { headers: {} });

    expect(fromController).toEqual(fromRoute);
    expect(fromRoute.status).toBe(401);
    expect(h.list).not.toHaveBeenCalled();
  });

  it("rejects a missing scope with the same 422 envelope", async () => {
    signIn();
    const fromRoute = await routeOutcome(
      await GET(new Request("http://localhost/api/saved-views"), undefined),
    );

    const user = await authorize("list");
    const pipe = new ZodValidationPipe(savedViewListQuerySchema);
    const fromController = await handlerOutcome(SavedViewsController, "list", () =>
      controller.list(pipe.transform({}), user),
    );

    expect(fromController).toEqual(fromRoute);
    expect(fromRoute.status).toBe(422);
    expect(h.list).not.toHaveBeenCalled();
  });
});

describe("POST /saved-views", () => {
  it("is registered at the verb, path, status and gate the Next route serves", () => {
    expect(routeSurface(SavedViewsController, "create")).toEqual({
      method: "POST",
      path: "/saved-views",
      status: 201,
      capability: undefined,
      guards: ["SessionAuthGuard"],
    });
  });

  it("answers the same 201 body as the Next route", async () => {
    signIn();
    const input = { scope: "pipeline", name: "My hot list", query: "status=3" } as const;
    h.create.mockResolvedValue(VIEW);
    const fromRoute = await routeOutcome(
      await POST(
        new Request("http://localhost/api/saved-views", {
          method: "POST",
          body: JSON.stringify(input),
        }),
        undefined,
      ),
    );

    h.create.mockResolvedValue(VIEW);
    const user = await authorize("create");
    const fromController = await handlerOutcome(SavedViewsController, "create", () =>
      controller.create(input, user),
    );

    expect(fromController).toEqual(fromRoute);
    expect(fromController.status).toBe(201);
  });

  it("maps a duplicate-name conflict to the same envelope", async () => {
    signIn();
    const input = { scope: "pipeline", name: "My hot list", query: "status=3" } as const;
    const conflict = (): never => {
      throw new AppError("CONFLICT", "A view by that name already exists");
    };

    h.create.mockImplementation(conflict);
    const fromRoute = await routeOutcome(
      await POST(
        new Request("http://localhost/api/saved-views", {
          method: "POST",
          body: JSON.stringify(input),
        }),
        undefined,
      ),
    );

    const user = await authorize("create");
    const fromController = await handlerOutcome(SavedViewsController, "create", () =>
      controller.create(input, user),
    );

    expect(fromController).toEqual(fromRoute);
    expect(fromRoute.status).toBe(409);
  });
});

describe("DELETE /saved-views/:id", () => {
  it("is registered at the verb, path, status and gate the Next route serves", () => {
    expect(routeSurface(SavedViewsController, "remove")).toEqual({
      method: "DELETE",
      path: "/saved-views/:id",
      status: 200,
      capability: undefined,
      guards: ["SessionAuthGuard"],
    });
  });

  it("answers the same body as the Next route", async () => {
    signIn();
    h.remove.mockResolvedValue({ id: "sv1" });
    const fromRoute = await routeOutcome(
      await DELETE(new Request("http://localhost/api/saved-views/sv1", { method: "DELETE" }), {
        params: Promise.resolve({ id: "sv1" }),
      }),
    );

    h.remove.mockResolvedValue({ id: "sv1" });
    const user = await authorize("remove");
    const fromController = await handlerOutcome(SavedViewsController, "remove", () =>
      controller.remove("sv1", user),
    );

    expect(fromController).toEqual(fromRoute);
    expect(fromController.body).toEqual({ id: "sv1" });
  });

  it("maps another user's id to the same 404 envelope", async () => {
    signIn();
    const missing = (): never => {
      throw new AppError("NOT_FOUND", "Saved view not found");
    };

    h.remove.mockImplementation(missing);
    const fromRoute = await routeOutcome(
      await DELETE(new Request("http://localhost/api/saved-views/other", { method: "DELETE" }), {
        params: Promise.resolve({ id: "other" }),
      }),
    );

    const user = await authorize("remove");
    const fromController = await handlerOutcome(SavedViewsController, "remove", () =>
      controller.remove("other", user),
    );

    expect(fromController).toEqual(fromRoute);
    expect(fromRoute.status).toBe(404);
  });
});
