import { describe, it, expect, beforeEach, vi } from "vitest";

/** POST /api/briefs/daily/generate — guarded: unauth → 401 (no service call, no rate-limit consumed). */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  generateDaily: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/services/brief.service", () => ({
  briefService: { generateDaily: h.generateDaily },
}));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://localhost/api/briefs/daily/generate", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const body = { date: "2026-07-23", tz: -180, priorityClientId: null };

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Associate" } };
  h.generateDaily.mockReset();
});

describe("POST /api/briefs/daily/generate", () => {
  it("401 when signed out (no service call)", async () => {
    h.session = null;
    const res = await POST(req(body), undefined);
    expect(res.status).toBe(401);
    expect(h.generateDaily).not.toHaveBeenCalled();
  });

  it("200 delegates to the service and returns the draft", async () => {
    const draft = { headline: "h", exceptions: [] };
    h.generateDaily.mockResolvedValue(draft);
    const res = await POST(req(body), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(draft);
    expect(h.generateDaily).toHaveBeenCalledWith(
      { date: "2026-07-23", tz: -180 },
      { priorityClientId: null, shiftA: null, shiftB: null, watchItems: null },
    );
  });
});
