import { describe, it, expect, beforeEach, vi } from "vitest";
import { AppError } from "@/server/http/app-error";

/**
 * GET/PATCH /api/crm/clients/:id — both gated `requireCapability("viewCrm")`: unauth → 401;
 * non-viewCrm role → 403; leadership → 200. `clientService` is mocked; auth runs for real.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  detail: vi.fn(),
  update: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/client.service", () => ({
  clientService: { detail: h.detail, update: h.update },
}));

import { GET, PATCH } from "./route";

const ctx = { params: Promise.resolve({ id: "c1" }) };
function patchReq(body: unknown) {
  return new Request("http://localhost/api/crm/clients/c1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
const getReq = () => new Request("http://localhost/api/crm/clients/c1");

beforeEach(() => {
  h.session = null;
  h.detail.mockReset();
  h.update.mockReset();
});

describe("GET /api/crm/clients/:id", () => {
  it("401 when signed out", async () => {
    const res = await GET(getReq(), ctx);
    expect(res.status).toBe(401);
    expect(h.detail).not.toHaveBeenCalled();
  });

  it("403 for a non-viewCrm role (Associate)", async () => {
    h.session = { user: { id: "u2", email: "a@desta.works", name: "A", role: "Associate" } };
    const res = await GET(getReq(), ctx);
    expect(res.status).toBe(403);
    expect(h.detail).not.toHaveBeenCalled();
  });

  it("200 for a leadership role (Manager)", async () => {
    h.session = { user: { id: "u1", email: "m@desta.works", name: "M", role: "Manager" } };
    h.detail.mockResolvedValue({
      client: { id: "c1" },
      contacts: [],
      pipelineSnapshot: { total: 0, active: 0, started: 0, verified: 0 },
    });
    const res = await GET(getReq(), ctx);
    expect(res.status).toBe(200);
    expect(h.detail).toHaveBeenCalledWith("c1");
  });

  it("maps a service NOT_FOUND to 404", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.detail.mockRejectedValue(new AppError("NOT_FOUND", "Client not found"));
    const res = await GET(getReq(), ctx);
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/crm/clients/:id", () => {
  it("401 when signed out and does not update", async () => {
    const res = await PATCH(patchReq({ location: "Hartford, CT" }), ctx);
    expect(res.status).toBe(401);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("200 for a leadership role (Owner) — forwards the validated input", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.update.mockResolvedValue({ id: "c1", location: "Hartford, CT" });
    const res = await PATCH(patchReq({ location: "Hartford, CT" }), ctx);
    expect(res.status).toBe(200);
    expect(h.update).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ location: "Hartford, CT" }),
      expect.objectContaining({ id: "u1" }),
    );
  });
});
