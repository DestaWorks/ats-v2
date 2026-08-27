import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  getSettings: vi.fn(),
  setDisabled: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/config/request-context", () => ({
  requestContext: () => ({ headers: async () => new Headers() }),
}));
vi.mock("@destaworks/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@destaworks/db/prisma", () => ({ prisma: {} }));
vi.mock("@destaworks/application/ai-ops.service", () => ({
  aiOpsService: { getSettings: h.getSettings, setDisabled: h.setDisabled },
}));

import { GET, PATCH } from "./route";

function patchReq(body: unknown) {
  return new Request("http://localhost/api/admin/ai/settings", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  h.session = null;
  h.getSettings.mockReset();
  h.setDisabled.mockReset();
});

describe("GET /api/admin/ai/settings", () => {
  it("401 when signed out", async () => {
    const res = await GET(new Request("http://localhost/api/admin/ai/settings"), undefined);
    expect(res.status).toBe(401);
    expect(h.getSettings).not.toHaveBeenCalled();
  });

  it("403 for a non-manageAiSettings role (Director)", async () => {
    h.session = { user: { id: "u1", email: "d@desta.works", name: "D", role: "Director" } };
    const res = await GET(new Request("http://localhost/api/admin/ai/settings"), undefined);
    expect(res.status).toBe(403);
  });

  it("200 for Owner", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.getSettings.mockResolvedValue({ disabled: false });
    const res = await GET(new Request("http://localhost/api/admin/ai/settings"), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ disabled: false });
  });
});

describe("PATCH /api/admin/ai/settings", () => {
  it("401 when signed out and does not toggle", async () => {
    const res = await PATCH(patchReq({ disabled: true }), undefined);
    expect(res.status).toBe(401);
    expect(h.setDisabled).not.toHaveBeenCalled();
  });

  it("200 for Owner — forwards the validated flag, actor, and reason", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.setDisabled.mockResolvedValue({ disabled: true, disabledReason: "incident" });
    const res = await PATCH(patchReq({ disabled: true, reason: "incident" }), undefined);
    expect(res.status).toBe(200);
    expect(h.setDisabled).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ id: "u1", role: "Owner" }),
      "incident",
    );
  });

  it("422 on a malformed body", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    const res = await PATCH(patchReq({ disabled: "yes" }), undefined);
    expect(res.status).toBe(422);
    expect(h.setDisabled).not.toHaveBeenCalled();
  });
});
