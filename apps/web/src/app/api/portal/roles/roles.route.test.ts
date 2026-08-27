import { describe, it, expect, beforeEach, vi } from "vitest";
import { AppError } from "@destaworks/integrations/http/app-error";

/**
 * POST /api/portal/roles — gated `requirePortalContact()` (the verified cookie), NOT the
 * internal Better-Auth session guard: unauth (no/invalid portal token) → 401; a valid portal
 * context → 201, with `clientId`/`postedByContactId` resolved server-side, never from the body.
 */

const h = vi.hoisted(() => ({
  ctx: null as {
    contactId: string;
    clientId: string;
    fullName: string;
    email: string | null;
  } | null,
  postRole: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/auth/portal-guards", () => ({
  requirePortalContact: async () => {
    if (!h.ctx) throw new AppError("UNAUTHORIZED", "Portal link is invalid or has expired");
    return h.ctx;
  },
}));
vi.mock("@destaworks/application/client-portal.service", () => ({
  clientPortalService: { postRole: h.postRole },
}));

import { POST } from "./route";

function postReq(body: unknown) {
  return new Request("http://localhost/api/portal/roles", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  h.ctx = null;
  h.postRole.mockReset();
});

describe("POST /api/portal/roles", () => {
  it("401 when there is no valid portal context and does not create", async () => {
    const res = await POST(postReq({ title: "NP" }), undefined);
    expect(res.status).toBe(401);
    expect(h.postRole).not.toHaveBeenCalled();
  });

  it("201 for a valid portal context — identity comes from the resolved context, not the body", async () => {
    h.ctx = { contactId: "c1", clientId: "cl1", fullName: "Jane Doe", email: "jane@x.com" };
    h.postRole.mockResolvedValue({ id: "newrole" });
    const res = await POST(postReq({ title: "NP", priority: "P2" }), undefined);
    expect(res.status).toBe(201);
    expect(h.postRole).toHaveBeenCalledWith(h.ctx, expect.objectContaining({ title: "NP" }));
  });

  it("422 on an empty title", async () => {
    h.ctx = { contactId: "c1", clientId: "cl1", fullName: "Jane Doe", email: null };
    const res = await POST(postReq({ title: "" }), undefined);
    expect(res.status).toBe(422);
    expect(h.postRole).not.toHaveBeenCalled();
  });

  it("422 on a spoofed clientId/postedByContactId in the body (strict schema rejects unknown keys)", async () => {
    h.ctx = { contactId: "c1", clientId: "cl1", fullName: "Jane Doe", email: null };
    const res = await POST(
      postReq({ title: "NP", clientId: "spoofed", postedByContactId: "spoofed" }),
      undefined,
    );
    expect(res.status).toBe(422);
    expect(h.postRole).not.toHaveBeenCalled();
  });
});
