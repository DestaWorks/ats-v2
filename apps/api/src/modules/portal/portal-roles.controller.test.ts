import "reflect-metadata";
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * `PortalRolesController` — `POST /portal/roles`, ported from `apps/web/src/app/api/portal/roles`.
 *
 * This is the only surface in the slice whose callers are OUTSIDE the company, so the happy path is
 * the least interesting thing here. Every case below is a REFUSAL except the three that establish
 * the endpoint admits anyone at all and answers narrowly.
 *
 * Only the token repository is mocked, so the real `requirePortalContact` predicate chain runs —
 * `status: "left"`, `portalEnabled: false`, revoked, expired, soft-deleted and unknown are decided
 * by the code that will decide them in production, not restated by this test.
 */

vi.mock("server-only", () => ({}));

type ContactRow = {
  id: string;
  clientId: string;
  fullName: string;
  email: string | null;
  status: string;
  portalEnabled: boolean;
  deletedAt: Date | null;
};

type TokenRow = { id: string; revokedAt: Date | null; expiresAt: Date; contact: ContactRow };

const h = vi.hoisted(() => ({ token: null as unknown }));

vi.mock("@destaworks/db/repositories/client-portal-token.repository", () => ({
  clientPortalTokenRepository: {
    findByHash: async () => h.token,
    touchLastUsed: async () => undefined,
  },
}));
vi.mock("@destaworks/application/client-portal.service", () => ({ clientPortalService: {} }));
vi.mock("@destaworks/application/portal-access-request.service", () => ({
  portalAccessRequestService: {},
}));

import { PORTAL_TOKEN_COOKIE } from "@destaworks/domain/constants";
import { postPortalRoleSchema } from "@destaworks/contracts/validation/portal";
import type { PortalContext } from "@destaworks/auth/portal-guards";
import { installNestRequestContext } from "../../common/request-context/nest-request-context";
import { PortalAuthGuard } from "../../common/guards/portal-auth.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import {
  describeRoutes,
  serviceStub,
  throughGuards,
} from "../../common/testing/controller-contract";
import { PortalRolesController } from "./portal-roles.controller";

installNestRequestContext();

type ClientPortalService = ConstructorParameters<typeof PortalRolesController>[0];

function controllerWith(methods: Partial<ClientPortalService>): PortalRolesController {
  return new PortalRolesController(serviceStub<ClientPortalService>(methods));
}

const CONTACT: PortalContext = {
  contactId: "contact_1",
  clientId: "client_1",
  fullName: "Dana Client",
  email: "dana@client.example",
};

/** A request carrying a well-formed portal cookie — valid as far as the transport is concerned. */
function withCookie(): { headers: Record<string, string> } {
  return { headers: { cookie: `${PORTAL_TOKEN_COOKIE}=raw-token` } };
}

function tokenFor(contact: Partial<ContactRow> = {}, token: Partial<TokenRow> = {}): TokenRow {
  return {
    id: "tok_1",
    revokedAt: null,
    expiresAt: new Date(Date.now() + 86_400_000),
    ...token,
    contact: {
      id: "contact_1",
      clientId: "client_1",
      fullName: "Dana Client",
      email: "dana@client.example",
      status: "active",
      portalEnabled: true,
      deletedAt: null,
      ...contact,
    },
  };
}

/** Drives the endpoint end to end: the real portal guard, then the controller method. */
async function postRoleAs(
  request: object,
  postRole: ReturnType<typeof vi.fn>,
): Promise<{ role: { id: string } }> {
  return await throughGuards({
    controller: PortalRolesController,
    method: "postRole",
    guards: [new PortalAuthGuard()],
    request,
    invoke: (req) => {
      // The harness hands back the same request object the guard mutated; reading `portal` off it
      // is how a `@CurrentPortalContact()` parameter is resolved, so the contact the controller
      // receives is the one the COOKIE produced and never a fixture the test supplied.
      const { portal } = req as { portal?: PortalContext };
      if (!portal) throw new Error("guard admitted without attaching a portal contact");
      return controllerWith({ postRole }).postRole({ title: "PMHNP", priority: "P2" }, portal);
    },
  });
}

beforeEach(() => {
  h.token = null;
});

describe("PortalRolesController — declared routes", () => {
  it("serves POST /portal/roles at 201 behind the portal guard and NOTHING else", () => {
    expect(describeRoutes(PortalRolesController)).toEqual([
      {
        route: "POST /portal/roles",
        guards: ["PortalAuthGuard"],
        capability: null,
        rateLimit: null,
        status: 201,
      },
    ]);
  });

  it("never stacks the session or capability guard — a portal contact is not an operator", () => {
    // Named as strings rather than imported: this test file must not be able to reach the operator
    // guards at all, which is the same separation the controller itself is asserting.
    const guards = describeRoutes(PortalRolesController).flatMap((r) => r.guards);
    expect(guards).not.toContain("SessionAuthGuard");
    expect(guards).not.toContain("CapabilityGuard");
  });

  it("declares no capability, because a client contact holds none", () => {
    expect(describeRoutes(PortalRolesController).every((r) => r.capability === null)).toBe(true);
  });
});

describe("PortalRolesController — refusals on a live, unexpired, unrevoked cookie", () => {
  it("refuses a contact who has LEFT the client, and posts no role", async () => {
    h.token = tokenFor({ status: "left" });
    const postRole = vi.fn();

    await expect(postRoleAs(withCookie(), postRole)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      status: 401,
    });
    expect(postRole).not.toHaveBeenCalled();
  });

  it("refuses a contact whose portal access is DISABLED, and posts no role", async () => {
    h.token = tokenFor({ portalEnabled: false });
    const postRole = vi.fn();

    await expect(postRoleAs(withCookie(), postRole)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      status: 401,
    });
    expect(postRole).not.toHaveBeenCalled();
  });

  it("refuses revoked, expired, soft-deleted and unknown tokens", async () => {
    const cases: Array<[string, TokenRow | null]> = [
      ["revoked", tokenFor({}, { revokedAt: new Date() })],
      ["expired", tokenFor({}, { expiresAt: new Date(Date.now() - 1000) })],
      ["deleted contact", tokenFor({ deletedAt: new Date() })],
      ["unknown", null],
    ];

    for (const [label, token] of cases) {
      h.token = token;
      const postRole = vi.fn();
      await expect(postRoleAs(withCookie(), postRole), label).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
      expect(postRole, label).not.toHaveBeenCalled();
    }
  });
});

describe("PortalRolesController — the token is read from the COOKIE and nowhere else", () => {
  it("refuses a request that sends no cookie at all", async () => {
    h.token = tokenFor();
    const postRole = vi.fn();

    await expect(postRoleAs({ headers: {} }, postRole)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(postRole).not.toHaveBeenCalled();
  });

  it("ignores a token supplied in a HEADER — a header authenticates nothing here", async () => {
    h.token = tokenFor();
    const postRole = vi.fn();

    await expect(
      postRoleAs({ headers: { "x-portal-token": "raw-token" } }, postRole),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(postRole).not.toHaveBeenCalled();
  });

  it("ignores a token supplied in the QUERY STRING — the closed IDOR stays closed", async () => {
    h.token = tokenFor();
    const postRole = vi.fn();

    await expect(
      postRoleAs(
        { headers: {}, query: { token: "raw-token" }, url: "/portal/roles?token=raw-token" },
        postRole,
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(postRole).not.toHaveBeenCalled();
  });
});

describe("PortalRolesController — identity and response shape", () => {
  it("posts the role for the contact the COOKIE resolved, not anything the body could say", async () => {
    h.token = tokenFor();
    const postRole = vi.fn().mockResolvedValue({ id: "role_9" });

    const response = await postRoleAs(withCookie(), postRole);

    expect(postRole).toHaveBeenCalledWith(CONTACT, { title: "PMHNP", priority: "P2" });
    expect(response).toEqual({ role: { id: "role_9" } });
  });

  it("answers with the id ALONE, even when the service hands back more", async () => {
    h.token = tokenFor();
    const postRole = vi.fn().mockResolvedValue({
      id: "role_9",
      clientId: "client_1",
      internalNotes: "rate negotiable down to 78",
    });

    const response = await postRoleAs(withCookie(), postRole);

    expect(response).toEqual({ role: { id: "role_9" } });
    expect(JSON.stringify(response)).not.toContain("negotiable");
  });

  it("rejects a body that tries to name its own client — the strict schema has no such key", () => {
    const pipe = new ZodValidationPipe(postPortalRoleSchema);

    expect(() => pipe.transform({ title: "PMHNP", clientId: "someone_else" })).toThrow();
    expect(() => pipe.transform({ title: "PMHNP", postedByContactId: "someone_else" })).toThrow();
    expect(pipe.transform({ title: "PMHNP" })).toEqual({ title: "PMHNP", priority: "P2" });
  });
});
