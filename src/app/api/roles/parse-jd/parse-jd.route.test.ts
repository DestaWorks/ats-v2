import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * POST /api/roles/parse-jd — guarded route: unauth → 401 (no service call); a valid request
 * delegates to `openRoleService.parseJd`. Rate limiting (SECURITY-AUDIT-APP.md H5) uses the real
 * `checkRateLimit` (unmocked) — `rate-limit.test.ts` covers its own threshold behavior.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  parseJd: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/services/open-role.service", () => ({
  openRoleService: { parseJd: h.parseJd },
}));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://localhost/api/roles/parse-jd", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const body = { text: "PMHNP needed in CT, full-time, telehealth, active license required." };

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Associate" } };
  h.parseJd.mockReset();
});

describe("POST /api/roles/parse-jd", () => {
  it("401 when signed out (no service call)", async () => {
    h.session = null;
    const res = await POST(req(body), undefined);
    expect(res.status).toBe(401);
    expect(h.parseJd).not.toHaveBeenCalled();
  });

  it("200 delegates to the service and returns its result", async () => {
    const result = { title: "PMHNP", state: "CT", credential: "PMHNP" };
    h.parseJd.mockResolvedValue(result);
    const res = await POST(req(body), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(result);
    expect(h.parseJd).toHaveBeenCalledWith(body);
  });
});
