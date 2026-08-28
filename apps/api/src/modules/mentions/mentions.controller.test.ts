import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Contract parity for `GET /mentions` and `POST /mentions/read` against the Next.js routes they
 * replace. Both are session-scoped: the recipient is never a parameter, which is the defect the
 * legacy `ats_get_mentions` had and the reason neither controller method accepts one.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  listMine: vi.fn(),
  markRead: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));
vi.mock("@destaworks/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@destaworks/application/mention.service", () => ({
  mentionService: { listMine: h.listMine, markRead: h.markRead },
}));

import { AppError } from "@destaworks/integrations/http/app-error";
import type { AuthUser } from "@destaworks/auth/guards";
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
import { MENTION_SERVICE } from "./mentions.tokens";
import { MentionsController } from "./mentions.controller";

installNestRequestContext();

const controller = (): MentionsController =>
  new MentionsController({ listMine: h.listMine, markRead: h.markRead });

async function admitted(handlerName: string): Promise<AuthUser> {
  h.session = { user: { id: "u1", email: "a@desta.works", name: "A", role: "Associate" } };
  const request: AuthenticatedRequest = { headers: {} };
  await runDeclaredGuards(MentionsController, handlerName, request);
  const { user } = request;
  if (!user) throw new Error("the guard admitted the request without attaching a user");
  return user;
}

const UNAUTHORIZED = {
  status: 401,
  body: { error: { code: "UNAUTHORIZED", message: "Sign in required" } },
};

beforeEach(() => {
  h.session = null;
  h.listMine.mockReset();
  h.markRead.mockReset();
});

describe("the mentions routes keep the Next.js verbs, paths and statuses", () => {
  it("lists at GET /mentions and marks read at POST /mentions/read, answering 200 on both", () => {
    expect(routeOf(MentionsController, "listMine")).toEqual({
      method: "GET",
      path: "/mentions",
      status: 200,
      capability: undefined,
      guards: ["SessionAuthGuard"],
    });
    expect(routeOf(MentionsController, "markRead")).toEqual({
      method: "POST",
      path: "/mentions/read",
      status: 200,
      capability: undefined,
      guards: ["SessionAuthGuard"],
    });
  });

  it("injects the mention service by token — never the imported singleton", () => {
    expect(injectedTokens(MentionsController)).toEqual([MENTION_SERVICE]);
  });
});

describe("GET /mentions", () => {
  it("returns the session user's mentions and unread count", async () => {
    const page = { mentions: [], unread: 3 };
    h.listMine.mockResolvedValue(page);
    const user = await admitted("listMine");
    expect(await controller().listMine(user)).toEqual(page);
    expect(h.listMine).toHaveBeenCalledWith(user);
  });

  it("401s signed out", async () => {
    expect(
      await renderFailure(() =>
        runDeclaredGuards(MentionsController, "listMine", { headers: {} } as AuthenticatedRequest),
      ),
    ).toEqual(UNAUTHORIZED);
    expect(h.listMine).not.toHaveBeenCalled();
  });
});

describe("POST /mentions/read", () => {
  it("returns the fresh unread count and forwards the parsed body plus the session user", async () => {
    h.markRead.mockResolvedValue({ unread: 2 });
    const user = await admitted("markRead");
    const body = { mentionId: "m1", all: false as const };
    expect(await controller().markRead(user, body)).toEqual({ unread: 2 });
    expect(h.markRead).toHaveBeenCalledWith(body, user);
  });

  it("validates the body with the contract schema — a body that is neither form is 422", async () => {
    const [pipe] = boundPipes(MentionsController, "markRead");
    expect(pipe).toBeInstanceOf(ZodValidationPipe);
    expect(await renderFailure(() => pipe?.transform({ all: false }))).toMatchObject({
      status: 422,
      body: { error: { code: "BAD_REQUEST", message: "Validation failed" } },
    });
  });

  it("carries someone-else's mention id through as the route's 404 envelope", async () => {
    h.markRead.mockRejectedValue(new AppError("NOT_FOUND", "Mention not found"));
    const user = await admitted("markRead");
    expect(
      await renderFailure(() => controller().markRead(user, { mentionId: "other", all: false })),
    ).toEqual({
      status: 404,
      body: { error: { code: "NOT_FOUND", message: "Mention not found" } },
    });
  });

  it("401s signed out and never marks anything", async () => {
    expect(
      await renderFailure(() =>
        runDeclaredGuards(MentionsController, "markRead", { headers: {} } as AuthenticatedRequest),
      ),
    ).toEqual(UNAUTHORIZED);
    expect(h.markRead).not.toHaveBeenCalled();
  });
});
