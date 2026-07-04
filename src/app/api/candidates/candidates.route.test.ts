import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * GET /api/candidates — the guarded board read: unauth → 401 (nothing fetched); a bad query param
 * → 422 (zod); a valid request → 200 with the `BoardResponse`.
 *
 * POST /api/candidates — the guarded manual create (Wave 2.4): unauth → 401; a valid body → 201 with
 * the PII-re-gated candidate (create forced to stage 0 by the service); missing `name` → 422; a
 * `status` key → 422 (strict, can't set stage); `licenseNumber` without `viewCredentials` → 403; with
 * the capability → passes through. `candidateService` is mocked (unit-tested separately); auth + zod
 * + the DTO re-gate run for real off the mocked session.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  listBoard: vi.fn(),
  create: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/candidate.service", () => ({
  candidateService: { listBoard: h.listBoard, create: h.create },
}));

import { GET, POST } from "./route";

const BOARD = { columns: [], terminal: [], meta: { total: 0, active: 0, overdue: 0, stuck: 0 } };

function req(query = "") {
  return new Request(`http://localhost/api/candidates${query}`);
}

function postReq(body: unknown) {
  return new Request("http://localhost/api/candidates", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Associate" } };
  h.listBoard.mockReset();
  h.listBoard.mockResolvedValue(BOARD);
  h.create.mockReset();
});

describe("GET /api/candidates", () => {
  it("returns 401 when signed out and does not read the board", async () => {
    h.session = null;
    const res = await GET(req(), undefined);
    expect(res.status).toBe(401);
    expect(h.listBoard).not.toHaveBeenCalled();
  });

  it("returns 422 for an invalid query param", async () => {
    const res = await GET(req("?track=NotATrack"), undefined);
    expect(res.status).toBe(422);
    expect(h.listBoard).not.toHaveBeenCalled();
  });

  it("returns 200 with the board and forwards parsed filters", async () => {
    const res = await GET(req("?track=Operations&includeTerminal=1"), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(BOARD);
    const [filters, , opts] = h.listBoard.mock.calls[0]!;
    expect(filters).toMatchObject({ track: "Operations" });
    expect(opts).toEqual({ includeTerminal: true });
  });
});

describe("POST /api/candidates", () => {
  it("returns 401 when signed out and does not create", async () => {
    h.session = null;
    const res = await POST(postReq({ name: "Jane" }), undefined);
    expect(res.status).toBe(401);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("201 happy path — forwards the validated input (default track); response is PII-re-gated", async () => {
    h.create.mockResolvedValue({
      id: "c-new",
      name: "Jane",
      licenseNumber: "SECRET",
      stageEnteredAt: new Date("2026-07-04T00:00:00.000Z"),
      createdAt: new Date("2026-07-04T00:00:00.000Z"),
      updatedAt: new Date("2026-07-04T00:00:00.000Z"),
    });
    const res = await POST(postReq({ name: "Jane" }), undefined);
    expect(res.status).toBe(201);
    // Schema applies the Clinical default; the service (mocked) forces stage 0 itself.
    expect(h.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Jane", track: "Clinical" }),
    );
    const body = await res.json();
    expect(body.candidate.id).toBe("c-new");
    // Associate lacks viewCredentials → licenseNumber must be stripped on the way out.
    expect(body.candidate.licenseNumber).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("SECRET");
  });

  it("422 when name is missing (required)", async () => {
    const res = await POST(postReq({ email: "j@x.com" }), undefined);
    expect(res.status).toBe(422);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("422 when the body tries to set a pipeline field (strict schema)", async () => {
    const res = await POST(postReq({ name: "Jane", status: "CLIENT_INTERVIEW" }), undefined);
    expect(res.status).toBe(422);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("403 when licenseNumber is present without viewCredentials", async () => {
    const res = await POST(postReq({ name: "Jane", licenseNumber: "LIC-1" }), undefined);
    expect(res.status).toBe(403);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("allows licenseNumber for a viewCredentials viewer (Owner) — passes through, 201", async () => {
    h.session = { user: { id: "o1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.create.mockResolvedValue({
      id: "c-new",
      name: "Jane",
      licenseNumber: "LIC-1",
      stageEnteredAt: new Date("2026-07-04T00:00:00.000Z"),
      createdAt: new Date("2026-07-04T00:00:00.000Z"),
      updatedAt: new Date("2026-07-04T00:00:00.000Z"),
    });
    const res = await POST(postReq({ name: "Jane", licenseNumber: "LIC-1" }), undefined);
    expect(res.status).toBe(201);
    expect(h.create).toHaveBeenCalledWith(expect.objectContaining({ licenseNumber: "LIC-1" }));
    // Owner has viewCredentials → the number rides back out.
    expect((await res.json()).candidate.licenseNumber).toBe("LIC-1");
  });
});
