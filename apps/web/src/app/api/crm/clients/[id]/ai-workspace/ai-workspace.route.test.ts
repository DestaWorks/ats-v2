import { describe, it, expect, beforeEach, vi } from "vitest";

/** POST /api/crm/clients/:id/ai-workspace — gated `viewCrm`. */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  generate: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/config/request-context", () => ({
  requestContext: () => ({ headers: async () => new Headers() }),
}));
vi.mock("@destaworks/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@destaworks/application/crm-ai-workspace.service", () => ({
  crmAiWorkspaceService: { generate: h.generate },
}));

import { POST } from "./route";

const ctx = { params: Promise.resolve({ id: "c1" }) };
const postReq = (body: unknown) =>
  new Request("http://localhost/api/crm/clients/c1/ai-workspace", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  h.session = null;
  h.generate.mockReset();
});

describe("POST /api/crm/clients/:id/ai-workspace", () => {
  it("401 when signed out", async () => {
    const res = await POST(postReq({ preset: "brief" }), ctx);
    expect(res.status).toBe(401);
    expect(h.generate).not.toHaveBeenCalled();
  });

  it("403 for a non-leadership role", async () => {
    h.session = { user: { id: "u1", email: "a@desta.works", name: "A", role: "Associate" } };
    const res = await POST(postReq({ preset: "brief" }), ctx);
    expect(res.status).toBe(403);
  });

  it("422 when neither preset nor customPrompt is given", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    const res = await POST(postReq({}), ctx);
    expect(res.status).toBe(422);
    expect(h.generate).not.toHaveBeenCalled();
  });

  it("200 for Owner, delegates to the service", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.generate.mockResolvedValue({ text: "Brief text" });
    const res = await POST(postReq({ preset: "brief" }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "Brief text" });
    expect(h.generate).toHaveBeenCalledWith("c1", { preset: "brief" });
  });
});
