import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

/**
 * Contract test for `CandidatesController` — the parity gate for the sixteen candidate endpoints
 * (SAAS-RESTRUCTURE-PLAN 4.3). For each one it pins what a client can observe: the status code, the
 * response shape, and the error envelope for the failures — the same facts
 * `apps/web/src/app/api/candidates/**` asserts about the routes still serving these paths.
 *
 * THE PII BOUNDARY IS TESTED IN BOTH DIRECTIONS, because it is enforced in both:
 *   - READ  — a viewer without `viewCredentials` never receives the `licenseNumber` KEY (absent, not
 *             null: a null would tell them the field exists and is empty), while a viewer with the
 *             capability does;
 *   - WRITE — the same viewer is REFUSED with 403 when they try to set it, on all three endpoints
 *             that accept it, before the service is called at all.
 *
 * `candidateService` / `noteService` / `resumeService` are mocked at the module boundary, so what
 * runs for real is everything between the wire and the service: routing, the guards, the Zod pipe,
 * `toCandidateDTO`, the interceptors and the exception filter.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  candidate: {
    listBoard: vi.fn(),
    listColumn: vi.fn(),
    listCandidates: vi.fn(),
    bulkMove: vi.fn(),
    create: vi.fn(),
    getProfile: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    getJourney: vi.fn(),
    move: vi.fn(),
    logOutreach: vi.fn(),
    purge: vi.fn(),
    restore: vi.fn(),
    verifyLicense: vi.fn(),
  },
  note: { add: vi.fn(), listByCandidate: vi.fn() },
  resume: { attachToCandidate: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@destaworks/db/prisma", () => ({ prisma: {} }));
vi.mock("@destaworks/application/candidate.service", () => ({ candidateService: h.candidate }));
vi.mock("@destaworks/application/note.service", () => ({ noteService: h.note }));
vi.mock("@destaworks/application/resume.service", () => ({ resumeService: h.resume }));
vi.mock("@destaworks/application/similarity.service", () => ({ similarityService: {} }));

import { encodeCursor } from "@destaworks/contracts/validation/cursor";
import {
  jsonBody,
  startContractHost,
  type ContractHost,
  type ErrorEnvelope,
} from "../../common/testing/contract-host";
import { CandidatesModule } from "./candidates.module";

/**
 * A candidate row as the repository hands it to the mapper. Structurally typed rather than declared
 * `CandidateRow`, so this fixture cannot silently become the source of the published surface —
 * `dto-published-surface.test.ts` owns that, against the real Prisma model.
 */
const ROW = {
  id: "c1",
  legacyId: null,
  name: "Jane Doe",
  email: "jane@example.com",
  phone: "+1 555 0100",
  city: "Austin",
  state: "TX",
  targetLocation: null,
  employer: null,
  yearsExp: 7,
  credential: "PMHNP",
  population: null,
  setting: null,
  telehealthPref: null,
  track: "Clinical",
  source: null,
  tags: [],
  outreachAttempts: 0,
  licenseNumber: "LIC-000-SECRET",
  licenseState: "TX",
  licenseStatus: "Active",
  licenseExpiry: null,
  licenseVerifiedAt: null,
  licenseVerifiedById: null,
  status: "NEW_CANDIDATE",
  stageOrder: 0,
  stageEnteredAt: new Date("2026-01-01T00:00:00.000Z"),
  placedAt: null,
  clientId: null,
  filledFromRoleId: null,
  createdById: "u1",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  deletedAt: null,
  deletedById: null,
};

const BOARD = { columns: [], terminal: [], meta: { total: 0, active: 0, overdue: 0, stuck: 0 } };
const COLUMN_PAGE = { status: "NEW_CANDIDATE", items: [], nextCursor: null, hasMore: false };

let api: ContractHost;

/** Signs in as `role`. `Associate` holds no capabilities; `Owner` holds every one. */
function signInAs(role: string): void {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "Test User", role } };
}

beforeAll(async () => {
  api = await startContractHost(CandidatesModule);
});

afterAll(async () => {
  await api.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  signInAs("Associate");
  h.candidate.listBoard.mockResolvedValue(BOARD);
  h.candidate.listColumn.mockResolvedValue(COLUMN_PAGE);
  h.candidate.create.mockResolvedValue(ROW);
  h.candidate.update.mockResolvedValue(ROW);
  h.candidate.restore.mockResolvedValue(ROW);
  h.candidate.verifyLicense.mockResolvedValue(ROW);
});

describe("GET /candidates — one path, two endpoints", () => {
  it("answers the full board when `column` is absent", async () => {
    const res = await api.request("/candidates?track=Operations&includeTerminal=1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(BOARD);
    expect(h.candidate.listColumn).not.toHaveBeenCalled();
    const [filters, , options] = h.candidate.listBoard.mock.calls[0] ?? [];
    expect(filters).toMatchObject({ track: "Operations" });
    expect(options).toEqual({ includeTerminal: true });
  });

  it("answers one column page when `column` is present, and never reads the board", async () => {
    const res = await api.request("/candidates?column=NEW_CANDIDATE");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(COLUMN_PAGE);
    expect(h.candidate.listBoard).not.toHaveBeenCalled();
    expect(h.candidate.listColumn.mock.calls[0]?.[0]).toBe("NEW_CANDIDATE");
  });

  it("decodes a valid cursor and forwards it to the column read", async () => {
    const cursor = encodeCursor(
      { createdAt: new Date("2026-01-01T00:00:00.000Z"), id: "c1" },
      "createdAt_desc",
    );
    const res = await api.request(`/candidates?column=NEW_CANDIDATE&cursor=${cursor}`);
    expect(res.status).toBe(200);
    expect(h.candidate.listColumn.mock.calls[0]?.[3]).toMatchObject({ id: "c1" });
  });

  it("rejects a malformed cursor with 400 BAD_REQUEST and reads nothing", async () => {
    const res = await api.request("/candidates?column=NEW_CANDIDATE&cursor=not-a-cursor");
    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe("BAD_REQUEST");
    expect(h.candidate.listColumn).not.toHaveBeenCalled();
  });

  it("rejects an invalid filter value with 422 and the zod issue list", async () => {
    const res = await api.request("/candidates?track=NotATrack");
    expect(res.status).toBe(422);
    const body = (await res.json()) as ErrorEnvelope;
    expect(body.error.code).toBe("BAD_REQUEST");
    expect(body.error.issues?.[0]?.path).toBe("track");
    expect(h.candidate.listBoard).not.toHaveBeenCalled();
  });

  it("ignores an unrecognised query parameter rather than rejecting it", async () => {
    const res = await api.request("/candidates?somethingElse=1");
    expect(res.status).toBe(200);
  });

  it("refuses a signed-out caller with 401 and reads nothing", async () => {
    h.session = null;
    const res = await api.request("/candidates");
    expect(res.status).toBe(401);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe("UNAUTHORIZED");
    expect(h.candidate.listBoard).not.toHaveBeenCalled();
  });
});

describe("the PII boundary — reading `licenseNumber`", () => {
  it("OMITS the key entirely for a viewer without viewCredentials", async () => {
    signInAs("Associate");
    const res = await api.request("/candidates", jsonBody({ name: "Jane Doe" }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { candidate: Record<string, unknown> };
    expect("licenseNumber" in body.candidate).toBe(false);
    expect(JSON.stringify(body)).not.toContain("LIC-000-SECRET");
  });

  it("publishes it to a viewer who holds viewCredentials", async () => {
    signInAs("Owner");
    const res = await api.request("/candidates", jsonBody({ name: "Jane Doe" }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { candidate: { licenseNumber?: string } };
    expect(body.candidate.licenseNumber).toBe("LIC-000-SECRET");
  });

  it("omits it on every endpoint that answers with a candidate", async () => {
    signInAs("Associate");
    const responses = await Promise.all([
      api.request("/candidates/c1", jsonBody({ name: "Jane" }, "PATCH")),
      api.request("/candidates/c1/restore", { method: "POST" }),
      api.request("/candidates/c1/verify-license", jsonBody({ licenseStatus: "Active" })),
    ]);
    for (const res of responses) {
      expect(res.status).toBe(200);
      expect(await res.text()).not.toContain("LIC-000-SECRET");
    }
  });
});

describe("the PII boundary — writing `licenseNumber`", () => {
  const attempts = [
    ["POST", "/candidates", { name: "Jane Doe", licenseNumber: "LIC-1" }, "set"],
    ["PATCH", "/candidates/c1", { licenseNumber: "LIC-1" }, "edit"],
    [
      "POST",
      "/candidates/c1/verify-license",
      { licenseStatus: "Active", licenseNumber: "LIC-1" },
      "edit",
    ],
  ] as const;

  for (const [method, path, body, verb] of attempts) {
    it(`refuses ${method} ${path} with 403 for a viewer without viewCredentials`, async () => {
      signInAs("Associate");
      const res = await api.request(path, jsonBody(body, method));
      expect(res.status).toBe(403);
      const envelope = (await res.json()) as ErrorEnvelope;
      expect(envelope.error.code).toBe("FORBIDDEN");
      expect(envelope.error.message).toBe(
        `You don't have permission to ${verb} the license number`,
      );
      expect(h.candidate.create).not.toHaveBeenCalled();
      expect(h.candidate.update).not.toHaveBeenCalled();
      expect(h.candidate.verifyLicense).not.toHaveBeenCalled();
    });

    it(`accepts ${method} ${path} from a viewer who holds viewCredentials`, async () => {
      signInAs("Owner");
      const res = await api.request(path, jsonBody(body, method));
      expect(res.status).toBe(method === "POST" && path === "/candidates" ? 201 : 200);
    });
  }
});

describe("candidate reads", () => {
  it("GET /candidates/list answers the offset page", async () => {
    const list = { candidates: [], total: 0, page: 1, pageSize: 25, totalPages: 0 };
    h.candidate.listCandidates.mockResolvedValue(list);
    const res = await api.request("/candidates/list?sort=fit&page=2");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(list);
    expect(h.candidate.listCandidates.mock.calls[0]?.[0]).toMatchObject({ sort: "fit", page: 2 });
  });

  it("GET /candidates/list is matched before the `:id` route", async () => {
    h.candidate.listCandidates.mockResolvedValue({ candidates: [], total: 0 });
    await api.request("/candidates/list");
    expect(h.candidate.getProfile).not.toHaveBeenCalled();
  });

  it("GET /candidates/:id answers the profile projection", async () => {
    h.candidate.getProfile.mockResolvedValue({ id: "c1", name: "Jane Doe" });
    const res = await api.request("/candidates/c1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ candidate: { id: "c1", name: "Jane Doe" } });
  });

  it("GET /candidates/:id/journey answers the timeline", async () => {
    h.candidate.getJourney.mockResolvedValue({ events: [] });
    const res = await api.request("/candidates/c1/journey");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ events: [] });
  });

  it("GET /candidates/:id/notes answers the viewer-scoped notes", async () => {
    h.note.listByCandidate.mockResolvedValue([{ id: "n1", body: "hi" }]);
    const res = await api.request("/candidates/c1/notes");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ notes: [{ id: "n1", body: "hi" }] });
  });
});

describe("candidate mutations", () => {
  it("POST /candidates/:id/move answers 200 with the persisted pipeline fields only", async () => {
    h.candidate.move.mockResolvedValue({
      ...ROW,
      status: "INITIAL_SCREENING",
      stageOrder: 1,
      stageEnteredAt: new Date("2026-02-02T00:00:00.000Z"),
    });
    const res = await api.request(
      "/candidates/c1/move",
      jsonBody({ toStatus: "INITIAL_SCREENING" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      candidate: {
        id: "c1",
        status: "INITIAL_SCREENING",
        stageOrder: 1,
        stageEnteredAt: "2026-02-02T00:00:00.000Z",
      },
    });
  });

  it("POST /candidates/:id/move never echoes candidate PII", async () => {
    h.candidate.move.mockResolvedValue(ROW);
    const res = await api.request("/candidates/c1/move", jsonBody({ toStatus: "NEW_CANDIDATE" }));
    const text = await res.text();
    expect(text).not.toContain("jane@example.com");
    expect(text).not.toContain("LIC-000-SECRET");
  });

  it("POST /candidates/bulk-move answers 200 with the partial-success summary", async () => {
    const summary = { moved: 1, blocked: [{ id: "c2", reason: "License not verified" }] };
    h.candidate.bulkMove.mockResolvedValue(summary);
    const res = await api.request(
      "/candidates/bulk-move",
      jsonBody({ ids: ["c1", "c2"], toStatus: "INITIAL_SCREENING" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(summary);
  });

  it("POST /candidates/:id/notes answers 201 and takes the author from the session", async () => {
    h.note.add.mockResolvedValue({ id: "n1", body: "Called back" });
    const res = await api.request("/candidates/c1/notes", jsonBody({ body: "Called back" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ note: { id: "n1", body: "Called back" } });
    expect(h.note.add.mock.calls[0]?.[2]).toMatchObject({ id: "u1" });
  });

  it("refuses a client-supplied note author — `addNoteSchema` is strict", async () => {
    const res = await api.request(
      "/candidates/c1/notes",
      jsonBody({ body: "Called back", authorName: "Someone Else" }),
    );
    expect(res.status).toBe(422);
    expect(h.note.add).not.toHaveBeenCalled();
  });

  it("POST /candidates/:id/outreach answers 201 with the logged attempt", async () => {
    h.candidate.logOutreach.mockResolvedValue({ id: "o1", channel: "phone" });
    const res = await api.request("/candidates/c1/outreach", jsonBody({ channel: "phone" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ attempt: { id: "o1", channel: "phone" } });
  });

  it("POST /candidates/:id/resume answers 201 with the document summary", async () => {
    h.resume.attachToCandidate.mockResolvedValue({
      id: "d1",
      candidateId: "c1",
      type: "resume",
      originalFilename: "cv.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      storageKey: "k",
      legacyUrl: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const res = await api.request(
      "/candidates/c1/resume",
      jsonBody({ originalFilename: "cv.pdf", mimeType: "application/pdf", storageKey: "k" }),
    );
    expect(res.status).toBe(201);
    expect((await res.json()) as { document: { id: string } }).toMatchObject({
      document: { id: "d1" },
    });
  });

  it("DELETE /candidates/:id answers the id only, never the candidate", async () => {
    const res = await api.request("/candidates/c1", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: "c1" });
    expect(h.candidate.softDelete).toHaveBeenCalledWith("c1");
  });

  it("POST /candidates/:id/restore answers 200, not Nest's default 201", async () => {
    const res = await api.request("/candidates/c1/restore", { method: "POST" });
    expect(res.status).toBe(200);
  });

  it("rejects a body that violates its contract schema with 422", async () => {
    const res = await api.request("/candidates", jsonBody({ name: "" }));
    expect(res.status).toBe(422);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe("BAD_REQUEST");
    expect(h.candidate.create).not.toHaveBeenCalled();
  });

  it("rejects a status key on create — stage 0 is the server's decision", async () => {
    signInAs("Owner");
    const res = await api.request("/candidates", jsonBody({ name: "Jane Doe", status: "PLACED" }));
    expect(res.status).toBe(422);
    expect(h.candidate.create).not.toHaveBeenCalled();
  });
});

describe("POST /candidates/:id/purge — the one capability-gated endpoint", () => {
  it("refuses a viewer without `purgeCandidate` with 403 and purges nothing", async () => {
    signInAs("Associate");
    const res = await api.request("/candidates/c1/purge", { method: "POST" });
    expect(res.status).toBe(403);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe("FORBIDDEN");
    expect(h.candidate.purge).not.toHaveBeenCalled();
  });

  it("refuses a signed-out caller with 401", async () => {
    h.session = null;
    const res = await api.request("/candidates/c1/purge", { method: "POST" });
    expect(res.status).toBe(401);
    expect(h.candidate.purge).not.toHaveBeenCalled();
  });

  it("answers 200 with the id for a viewer who holds the capability", async () => {
    signInAs("Owner");
    const res = await api.request("/candidates/c1/purge", { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: "c1" });
  });
});

describe("the error envelope", () => {
  it("renders a service AppError at its own status, with its own code", async () => {
    const { AppError } = await import("@destaworks/integrations/http/app-error");
    h.candidate.getProfile.mockRejectedValue(new AppError("NOT_FOUND", "Candidate not found"));
    const res = await api.request("/candidates/missing");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: "NOT_FOUND", message: "Candidate not found" },
    });
  });

  it("never leaks an unexpected error's message, and hands back a correlating ref", async () => {
    h.candidate.getProfile.mockRejectedValue(
      new Error("Unique constraint failed on jane@example.com"),
    );
    const res = await api.request("/candidates/c1");
    expect(res.status).toBe(500);
    const body = (await res.json()) as ErrorEnvelope;
    expect(body.error).toMatchObject({ code: "INTERNAL", message: "Internal server error" });
    expect(JSON.stringify(body)).not.toContain("jane@example.com");
    expect(typeof body.error.ref).toBe("string");
  });

  it("answers an unmatched path with 404 rather than a 500", async () => {
    const res = await api.request("/candidates/c1/not-a-route");
    expect(res.status).toBe(404);
  });
});
