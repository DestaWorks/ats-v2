import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Contract parity for the five `/api/me/*` routes against the Next.js handlers they replace.
 *
 * Every route here is "me", so the denial that matters is 401 — there is no capability to get
 * wrong, and no id parameter that could widen the read to somebody else's record. What IS asserted
 * per route is that the session user reaching the service is the one the guard resolved, never a
 * value the caller supplied.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  getPreferences: vi.fn(),
  updatePreferences: vi.fn(),
  uploadAvatar: vi.fn(),
  getLearn: vi.fn(),
  setChapter: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));
vi.mock("@destaworks/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@destaworks/db/memberships", async () => ({
  membershipReader: (
    await import("@destaworks/auth/testing/membership-double")
  ).singleTenantMembershipReader(() => h.session),
}));
vi.mock("@destaworks/application/user-preferences.service", () => ({
  userPreferencesService: {
    getMine: h.getPreferences,
    updateMine: h.updatePreferences,
    uploadAvatar: h.uploadAvatar,
  },
}));
vi.mock("@destaworks/application/learn.service", () => ({
  learnService: { getMine: h.getLearn, setChapter: h.setChapter },
}));

import { AppError } from "@destaworks/integrations/http/app-error";
import type { AuthContext } from "@destaworks/auth/guards";
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
import { LEARN_SERVICE, USER_PREFERENCES_SERVICE } from "./account.tokens";
import { MeController } from "./me.controller";

installNestRequestContext();

const PREFERENCES = {
  emailSignature: "— O",
  stickyNote: null,
  bio: null,
  phone: null,
  location: null,
};
const PROGRESS = { completed: ["intro"] };

function controller(): MeController {
  return new MeController(
    {
      getMine: h.getPreferences,
      updateMine: h.updatePreferences,
      uploadAvatar: h.uploadAvatar,
    },
    { getMine: h.getLearn, setChapter: h.setChapter },
  );
}

function signInAs(role: string): void {
  h.session = { user: { id: "u1", email: "o@desta.works", name: "Owner", role } };
}

/** Drives the route's REAL guard chain and hands back the user it attached to the request. */
async function admitted(handlerName: string, role = "Associate"): Promise<AuthContext> {
  signInAs(role);
  const request: AuthenticatedRequest = { headers: {} };
  await runDeclaredGuards(MeController, handlerName, request);
  const { user } = request;
  if (!user) throw new Error("the guard chain admitted the request without attaching a user");
  return user;
}

/** The 401 every route here must answer when nothing signed in. */
async function denyingSignedOut(handlerName: string): Promise<unknown> {
  h.session = null;
  return await renderFailure(() =>
    runDeclaredGuards(MeController, handlerName, { headers: {} } as AuthenticatedRequest),
  );
}

const UNAUTHORIZED = {
  status: 401,
  body: { error: { code: "UNAUTHORIZED", message: "Sign in required" } },
};

beforeEach(() => {
  h.session = null;
  for (const fn of [
    h.getPreferences,
    h.updatePreferences,
    h.uploadAvatar,
    h.getLearn,
    h.setChapter,
  ]) {
    fn.mockReset();
  }
});

describe("the /me routes keep the Next.js verbs, paths and statuses", () => {
  it("mounts every handler where its route was", () => {
    expect(routeOf(MeController, "me")).toMatchObject({ method: "GET", path: "/me", status: 200 });
    expect(routeOf(MeController, "getPreferences")).toMatchObject({
      method: "GET",
      path: "/me/preferences",
    });
    expect(routeOf(MeController, "updatePreferences")).toMatchObject({
      method: "PATCH",
      path: "/me/preferences",
    });
    expect(routeOf(MeController, "getLearnProgress")).toMatchObject({
      method: "GET",
      path: "/me/learn-progress",
    });
    expect(routeOf(MeController, "updateLearnProgress")).toMatchObject({
      method: "PATCH",
      path: "/me/learn-progress",
    });
  });

  it("answers 200 on the avatar upload, not Nest's POST default of 201", () => {
    expect(routeOf(MeController, "uploadAvatar")).toMatchObject({
      method: "POST",
      path: "/me/avatar",
      status: 200,
    });
  });

  it("guards every route with the session, and requires no capability of any of them", () => {
    for (const handler of [
      "me",
      "getPreferences",
      "updatePreferences",
      "uploadAvatar",
      "getLearnProgress",
      "updateLearnProgress",
    ]) {
      expect(routeOf(MeController, handler).guards).toEqual(["SessionAuthGuard"]);
      expect(routeOf(MeController, handler).capability).toBeUndefined();
    }
  });

  it("injects both services by token — never the imported singletons", () => {
    expect(injectedTokens(MeController)).toEqual([USER_PREFERENCES_SERVICE, LEARN_SERVICE]);
  });
});

describe("GET /me", () => {
  it("returns the session user's identity and role, and nothing else", async () => {
    expect(controller().me(await admitted("me", "Owner"))).toEqual({
      id: "u1",
      email: "o@desta.works",
      name: "Owner",
      role: "Owner",
    });
  });

  it("401s signed out, with the same envelope the Next.js route returns", async () => {
    expect(await denyingSignedOut("me")).toEqual(UNAUTHORIZED);
  });
});

describe("GET/PATCH /me/preferences", () => {
  it("returns the caller's own preferences", async () => {
    h.getPreferences.mockResolvedValue(PREFERENCES);
    const user = await admitted("getPreferences");
    expect(await controller().getPreferences(user)).toEqual(PREFERENCES);
    expect(h.getPreferences).toHaveBeenCalledWith(user);
  });

  it("updates with the session user, never a caller-supplied one", async () => {
    h.updatePreferences.mockResolvedValue(PREFERENCES);
    const user = await admitted("updatePreferences");
    await controller().updatePreferences(user, { stickyNote: "note" });
    expect(h.updatePreferences).toHaveBeenCalledWith(user, { stickyNote: "note" });
  });

  it("validates the body with the contract schema, answering 422 + issues", async () => {
    const [pipe] = boundPipes(MeController, "updatePreferences");
    expect(pipe).toBeInstanceOf(ZodValidationPipe);
    expect(await renderFailure(() => pipe?.transform({ unknownKey: 1 }))).toMatchObject({
      status: 422,
      body: { error: { code: "BAD_REQUEST", message: "Validation failed" } },
    });
  });

  it("401s both halves signed out", async () => {
    expect(await denyingSignedOut("getPreferences")).toEqual(UNAUTHORIZED);
    expect(await denyingSignedOut("updatePreferences")).toEqual(UNAUTHORIZED);
    expect(h.getPreferences).not.toHaveBeenCalled();
    expect(h.updatePreferences).not.toHaveBeenCalled();
  });
});

describe("POST /me/avatar", () => {
  it("returns the stored URL", async () => {
    h.uploadAvatar.mockResolvedValue({ url: "https://cdn.example/a.jpg" });
    const user = await admitted("uploadAvatar");
    expect(await controller().uploadAvatar(user, { dataUrl: "data:image/jpeg;base64,AA" })).toEqual(
      {
        url: "https://cdn.example/a.jpg",
      },
    );
  });

  it("carries an upload failure through as the route's own envelope", async () => {
    h.uploadAvatar.mockRejectedValue(new AppError("BAD_REQUEST", "Unsupported image"));
    const user = await admitted("uploadAvatar");
    expect(
      await renderFailure(() => controller().uploadAvatar(user, { dataUrl: "data:text/plain,x" })),
    ).toEqual({
      status: 400,
      body: { error: { code: "BAD_REQUEST", message: "Unsupported image" } },
    });
  });

  it("401s signed out and never reaches storage", async () => {
    expect(await denyingSignedOut("uploadAvatar")).toEqual(UNAUTHORIZED);
    expect(h.uploadAvatar).not.toHaveBeenCalled();
  });
});

describe("GET/PATCH /me/learn-progress", () => {
  it("reads and writes the caller's own chapter map", async () => {
    h.getLearn.mockResolvedValue(PROGRESS);
    h.setChapter.mockResolvedValue(PROGRESS);
    const user = await admitted("getLearnProgress");
    expect(await controller().getLearnProgress(user)).toEqual(PROGRESS);
    expect(
      await controller().updateLearnProgress(user, { chapterId: "intro", done: true }),
    ).toEqual(PROGRESS);
    expect(h.setChapter).toHaveBeenCalledWith(user, "intro", true);
  });

  it("401s both halves signed out", async () => {
    expect(await denyingSignedOut("getLearnProgress")).toEqual(UNAUTHORIZED);
    expect(await denyingSignedOut("updateLearnProgress")).toEqual(UNAUTHORIZED);
    expect(h.setChapter).not.toHaveBeenCalled();
  });
});
