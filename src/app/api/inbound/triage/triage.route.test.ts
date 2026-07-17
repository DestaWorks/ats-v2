import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * POST /api/inbound/triage — guarded route: unauth → 401 (no service call, no rate-limit
 * consumed); a valid request delegates to `inboundService.triage` (extraction/dedupe/matching
 * live in the service). Rate limiting (SECURITY-AUDIT-APP.md H5) is exercised for real via the
 * actual `checkRateLimit` (unmocked) — `rate-limit.test.ts` covers its own threshold behavior.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  triage: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/services/inbound.service", () => ({ inboundService: { triage: h.triage } }));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://localhost/api/inbound/triage", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const body = { messageText: "Hi, I'm interested in the PMHNP role in CT, license active." };

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Associate" } };
  h.triage.mockReset();
});

describe("POST /api/inbound/triage", () => {
  it("401 when signed out (no service call)", async () => {
    h.session = null;
    const res = await POST(req(body), undefined);
    expect(res.status).toBe(401);
    expect(h.triage).not.toHaveBeenCalled();
  });

  it("200 delegates to the service and returns its result", async () => {
    const result = { extracted: {}, matches: [], candidateMatch: null };
    h.triage.mockResolvedValue(result);
    const res = await POST(req(body), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(result);
    expect(h.triage).toHaveBeenCalledWith(body);
  });
});
