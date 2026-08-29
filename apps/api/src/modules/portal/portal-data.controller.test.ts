import "reflect-metadata";
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * `PortalDataController` — `GET /portal/data` and `POST /portal/log-view`, ported from the
 * in-process calls in `apps/web/src/app/portal/page.tsx`.
 *
 * These two answer people OUTSIDE the company, so almost everything below is a refusal. As in
 * `portal-roles.controller.test.ts`, only the token repository is mocked, so the real
 * `requirePortalContact` predicate chain decides `status: "left"`, `portalEnabled: false`, revoked,
 * expired, soft-deleted and unknown — this file restates none of it.
 *
 * The read is the more dangerous of the two: it takes NO parameters, so the test that matters is
 * that nothing a caller can send — body, header or query — changes whose data comes back.
 */

vi.mock("server-only", () => ({}));

type ContactRow = {
  id: string;
  clientId: string;
  tenantId: string | null;
  fullName: string;
  email: string | null;
  status: string;
  portalEnabled: boolean;
  deletedAt: Date | null;
};

type TokenRow = { id: string; revokedAt: Date | null; expiresAt: Date; contact: ContactRow };

const h = vi.hoisted(() => ({ token: null as unknown }));

vi.mock("@destaworks/db/tenancy/membership.repository", () => ({
  tenantRepository: {
    findBySlug: async (slug: string) =>
      slug === "acme" ? { id: "t1", status: "active", deletedAt: null } : null,
  },
}));

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
import {
  portalLogViewSchema,
  type PortalDataDTO,
  type PortalLogViewInput,
} from "@destaworks/contracts/validation/portal";
import type { PortalContext } from "@destaworks/auth/portal-guards";
import { installNestRequestContext } from "../../common/request-context/nest-request-context";
import { PortalAuthGuard } from "../../common/guards/portal-auth.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import {
  describeRoutes,
  serviceStub,
  throughGuards,
} from "../../common/testing/controller-contract";
import { PortalDataController } from "./portal-data.controller";

installNestRequestContext();

type ClientPortalService = ConstructorParameters<typeof PortalDataController>[0];

function controllerWith(methods: Partial<ClientPortalService>): PortalDataController {
  return new PortalDataController(serviceStub<ClientPortalService>(methods));
}

const CONTACT: PortalContext = {
  contactId: "contact_1",
  clientId: "client_1",
  tenantId: "t1",
  fullName: "Dana Client",
  email: "dana@client.example",
};

const DATA: PortalDataDTO = {
  client: { name: "Acme Health" },
  contact: { fullName: "Dana Client" },
  candidates: [
    {
      id: "cand_1",
      name: "Sam Rivera",
      credential: "PMHNP",
      licenseState: "CA",
      status: "Client Interview",
      city: "Fresno",
      state: "CA",
      yearsExp: 6,
      employer: "Valley Health",
    },
  ],
  roles: [],
};

function withCookie(extra: Record<string, string> = {}): { headers: Record<string, string> } {
  return {
    headers: { cookie: `${PORTAL_TOKEN_COOKIE}=raw-token`, host: "acme.desta.works", ...extra },
  };
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
      tenantId: "t1",
      fullName: "Dana Client",
      email: "dana@client.example",
      status: "active",
      portalEnabled: true,
      deletedAt: null,
      ...contact,
    },
  };
}

/** Drives an endpoint end to end: the real portal guard, then the controller method. */
async function through<TResult>(
  method: "data" | "logView",
  request: object,
  invoke: (contact: PortalContext) => TResult | Promise<TResult>,
): Promise<TResult> {
  return await throughGuards({
    controller: PortalDataController,
    method,
    guards: [new PortalAuthGuard()],
    request,
    invoke: (req) => {
      // Reading `portal` back off the request the guard mutated is how a `@CurrentPortalContact()`
      // parameter resolves, so the contact reaching the handler is the one the COOKIE produced.
      const { portal } = req as { portal?: PortalContext };
      if (!portal) throw new Error("guard admitted without attaching a portal contact");
      return invoke(portal);
    },
  });
}

async function dataAs(request: object, data: ReturnType<typeof vi.fn>): Promise<PortalDataDTO> {
  return await through("data", request, (contact) => controllerWith({ data }).data(contact));
}

async function logViewAs(
  request: object,
  logView: ReturnType<typeof vi.fn>,
  page: PortalLogViewInput["page"] = "portal",
): Promise<{ ok: true }> {
  return await through("logView", request, (contact) =>
    controllerWith({ logView }).logView({ page }, contact),
  );
}

beforeEach(() => {
  h.token = null;
});

describe("PortalDataController — declared routes", () => {
  it("serves exactly the two portal reads, behind the portal guard and nothing else", () => {
    expect(describeRoutes(PortalDataController)).toEqual([
      {
        route: "GET /portal/data",
        guards: ["PortalAuthGuard"],
        capability: null,
        rateLimit: null,
        status: 200,
      },
      {
        route: "POST /portal/log-view",
        guards: ["PortalAuthGuard"],
        capability: null,
        rateLimit: null,
        status: 200,
      },
    ]);
  });

  it("never stacks the session or capability guard — a portal contact is not an operator", () => {
    // Named as strings rather than imported: this file must not be able to reach the operator
    // guards at all, which is the separation the controller itself asserts.
    const guards = describeRoutes(PortalDataController).flatMap((r) => r.guards);
    expect(guards).not.toContain("SessionAuthGuard");
    expect(guards).not.toContain("CapabilityGuard");
  });

  it("declares no capability, because a client contact holds none", () => {
    expect(describeRoutes(PortalDataController).every((r) => r.capability === null)).toBe(true);
  });
});

describe("PortalDataController — refusals on a live, unexpired, unrevoked cookie", () => {
  it("refuses a contact who has LEFT the client, and reads nothing", async () => {
    h.token = tokenFor({ status: "left" });
    const data = vi.fn();

    await expect(dataAs(withCookie(), data)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      status: 401,
    });
    expect(data).not.toHaveBeenCalled();
  });

  it("refuses a contact whose portal access is DISABLED, and reads nothing", async () => {
    h.token = tokenFor({ portalEnabled: false });
    const data = vi.fn();

    await expect(dataAs(withCookie(), data)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      status: 401,
    });
    expect(data).not.toHaveBeenCalled();
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
      const data = vi.fn();
      await expect(dataAs(withCookie(), data), label).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
      expect(data, label).not.toHaveBeenCalled();
    }
  });

  it("refuses the write too — a departed contact logs no view", async () => {
    h.token = tokenFor({ status: "left" });
    const logView = vi.fn();

    await expect(logViewAs(withCookie(), logView)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(logView).not.toHaveBeenCalled();
  });

  it("refuses the write for a contact whose portal access is DISABLED", async () => {
    h.token = tokenFor({ portalEnabled: false });
    const logView = vi.fn();

    await expect(logViewAs(withCookie(), logView)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(logView).not.toHaveBeenCalled();
  });
});

describe("PortalDataController — the token is read from the COOKIE and nowhere else", () => {
  it("refuses a request that sends no cookie at all", async () => {
    h.token = tokenFor();
    const data = vi.fn();

    await expect(dataAs({ headers: {} }, data)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(data).not.toHaveBeenCalled();
  });

  it("ignores a token supplied in a HEADER — a header authenticates nothing here", async () => {
    h.token = tokenFor();
    const data = vi.fn();

    await expect(
      dataAs({ headers: { "x-portal-token": "raw-token" } }, data),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(data).not.toHaveBeenCalled();
  });

  it("ignores a token supplied in the QUERY STRING — the closed IDOR stays closed", async () => {
    h.token = tokenFor();
    const data = vi.fn();

    await expect(
      dataAs(
        { headers: {}, query: { token: "raw-token" }, url: "/portal/data?token=raw-token" },
        data,
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(data).not.toHaveBeenCalled();
  });

  it("refuses the write with no cookie, however well-formed the body is", async () => {
    h.token = tokenFor();
    const logView = vi.fn();

    await expect(logViewAs({ headers: {} }, logView)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(logView).not.toHaveBeenCalled();
  });
});

describe("PortalDataController — nothing a caller sends selects whose data is returned", () => {
  it("reads for the contact the COOKIE resolved, and passes the service nothing else", async () => {
    h.token = tokenFor();
    const data = vi.fn().mockResolvedValue(DATA);

    const response = await dataAs(
      withCookie({ "x-client-id": "someone_else", "x-contact-id": "someone_else" }),
      data,
    );

    expect(data).toHaveBeenCalledWith(CONTACT);
    expect(data).toHaveBeenCalledTimes(1);
    expect(response).toEqual(DATA);
  });

  it("ignores a clientId in the query string — the read takes no parameters at all", async () => {
    h.token = tokenFor();
    const data = vi.fn().mockResolvedValue(DATA);

    await dataAs(
      {
        ...withCookie(),
        query: { clientId: "client_evil", contactId: "contact_evil", email: "x@y.example" },
        url: "/portal/data?clientId=client_evil",
      },
      data,
    );

    const [passed] = data.mock.calls[0] as [PortalContext];
    expect(passed.clientId).toBe("client_1");
    expect(passed.contactId).toBe("contact_1");
  });

  it("logs the view for the cookie's contact, with only the page name from the body", async () => {
    h.token = tokenFor();
    const logView = vi.fn().mockResolvedValue(undefined);

    const response = await logViewAs(withCookie(), logView);

    expect(logView).toHaveBeenCalledWith(CONTACT, "portal");
    expect(response).toEqual({ ok: true });
  });
});

describe("PortalDataController — the response carries no more than the projection does", () => {
  it("answers with what the service returned and does not decorate it", async () => {
    h.token = tokenFor();
    const data = vi.fn().mockResolvedValue(DATA);

    const response = await dataAs(withCookie(), data);

    expect(Object.keys(response).sort()).toEqual(["candidates", "client", "contact", "roles"]);
  });

  it("acknowledges a logged view without echoing the contact back", async () => {
    h.token = tokenFor();
    const response = await logViewAs(withCookie(), vi.fn().mockResolvedValue(undefined));

    expect(Object.keys(response)).toEqual(["ok"]);
    expect(JSON.stringify(response)).not.toContain("contact_1");
    expect(JSON.stringify(response)).not.toContain("client_1");
  });
});

describe("PortalDataController — the log-view body is an allow-list", () => {
  const pipe = new ZodValidationPipe(portalLogViewSchema);

  it("rejects a body that tries to name its own client or contact", () => {
    expect(() => pipe.transform({ page: "portal", clientId: "someone_else" })).toThrow();
    expect(() => pipe.transform({ page: "portal", contactId: "someone_else" })).toThrow();
    expect(() => pipe.transform({ page: "portal", email: "x@y.example" })).toThrow();
  });

  it("rejects an unknown page rather than writing free text into the audit trail", () => {
    expect(() => pipe.transform({ page: "<script>alert(1)</script>" })).toThrow();
    expect(() => pipe.transform({ page: "" })).toThrow();
    expect(() => pipe.transform({})).toThrow();
    expect(pipe.transform({ page: "portal" })).toEqual({ page: "portal" });
  });
});
