import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AuthUser } from "@/server/auth/guards";
import { decodeCursor } from "@/lib/validation/cursor";

/**
 * Proves `candidateService.listBoard` builds the funnel board WITHOUT a DB, now via PER-COLUMN
 * KEYSET reads instead of a single load-all-then-group: the 9 active stages are always present
 * (empties included, order 0..8), each column's TRUE `count` comes from ONE filtered `groupBy`,
 * each column ships one keyset page (≤ BOARD_PAGE) with its own `nextCursor`/`hasMore`, terminal
 * states are summarized (counts always; card lists + cursor only when `includeTerminal`),
 * `meta.overdue`/`meta.stuck` come from targeted COUNT queries (not a full scan), a card NEVER
 * carries `licenseNumber`, and a `status` filter focuses one column's query. `listColumn` serves
 * the per-column load-more. We mock the repositories; timing + the PII DTO + cursor codec run for real.
 */

const h = vi.hoisted(() => ({
  candidateRepo: {
    list: vi.fn(),
    count: vi.fn(),
    groupByStatusFiltered: vi.fn(),
    groupByStatus: vi.fn(),
    listStaleActive: vi.fn(),
  },
  clientRepo: { list: vi.fn() },
  clientRulesRepo: { list: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/repositories/candidate.repository", () => ({
  candidateRepository: h.candidateRepo,
}));
vi.mock("@/server/repositories/client.repository", () => ({
  clientRepository: h.clientRepo,
}));
vi.mock("@/server/repositories/client-rules.repository", async () => {
  const actual = await vi.importActual<
    typeof import("@/server/repositories/client-rules.repository")
  >("@/server/repositories/client-rules.repository");
  return { ...actual, clientRulesRepository: h.clientRulesRepo };
});

import { candidateService } from "./candidate.service";

const viewer: AuthUser = { id: "u1", email: "u@desta.works", name: "U", role: "Associate" };

const DAY = 86_400_000;
function daysAgo(n: number) {
  return new Date(Date.now() - n * DAY);
}

/** A candidate row with the fields the DTO + timing + cursor read (incl. sensitive `licenseNumber`). */
function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "c",
    name: "Jane",
    track: "Clinical",
    credential: "PMHNP",
    licenseState: "NJ",
    licenseNumber: "SECRET-123",
    licenseStatus: "Active",
    population: "Adult",
    setting: "Telehealth",
    clientId: null,
    status: "NEW_CANDIDATE",
    stageOrder: 0,
    stageEnteredAt: new Date(),
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    ...overrides,
  };
}

/** Mock the per-column reads + the filtered groupBy from a `status → rows` map. */
function seedBoard(byStatus: Record<string, Record<string, unknown>[]>) {
  h.candidateRepo.list.mockImplementation(async (f: { status?: string }) =>
    f.status ? (byStatus[f.status] ?? []) : [],
  );
  h.candidateRepo.groupByStatusFiltered.mockResolvedValue(
    Object.entries(byStatus).map(([status, rows]) => ({ status, _count: { _all: rows.length } })),
  );
}

beforeEach(() => {
  h.candidateRepo.list.mockReset().mockResolvedValue([]);
  h.candidateRepo.count.mockReset().mockResolvedValue(0);
  h.candidateRepo.groupByStatusFiltered.mockReset().mockResolvedValue([]);
  h.clientRepo.list.mockReset().mockResolvedValue([{ id: "cl1", name: "Sterling Institute" }]);
  h.clientRulesRepo.list.mockReset().mockResolvedValue([]);
});

/** A `client_rules` row for `cl1` = Sterling Institute (states/creds/pops/settings drive scoring). */
function sterlingRules(overrides: Record<string, unknown> = {}) {
  return {
    id: "r1",
    clientId: "cl1",
    states: ["CT"],
    creds: ["PMHNP", "PMHNP-BC", "MD", "DO", "PsyD", "PhD"],
    pops: ["Child/Adolescent"],
    settings: ["Hybrid", "Outpatient"],
    priority: "HIGH",
    autoDisqualify: ["No CT license"],
    ...overrides,
  };
}

describe("candidateService.listBoard — scoring", () => {
  it("folds the fit pct onto the card for a client with rules", async () => {
    h.clientRulesRepo.list.mockResolvedValue([sterlingRules()]);
    seedBoard({
      NEW_CANDIDATE: [
        // Full match: CT / PMHNP / Child-Adolescent / Hybrid / Active → 100/100.
        row({
          id: "full",
          clientId: "cl1",
          licenseState: "CT",
          credential: "PMHNP",
          population: "Child/Adolescent",
          setting: "Hybrid",
          licenseStatus: "Active",
        }),
        // Mismatch on state + population + setting: credential (30) + license (10) = 40/100.
        row({
          id: "partial",
          clientId: "cl1",
          licenseState: "NJ",
          credential: "PMHNP",
          population: "Adult",
          setting: "Telehealth",
          licenseStatus: "Active",
        }),
      ],
    });
    const board = await candidateService.listBoard({}, viewer);
    const cards = board.columns.find((c) => c.status === "NEW_CANDIDATE")!.candidates;
    expect(cards.find((c) => c.id === "full")!.score).toBe(100);
    expect(cards.find((c) => c.id === "partial")!.score).toBe(40);
  });

  it("scores null when the candidate has no client", async () => {
    h.clientRulesRepo.list.mockResolvedValue([sterlingRules()]);
    seedBoard({ NEW_CANDIDATE: [row({ id: "noclient", clientId: null })] });
    const board = await candidateService.listBoard({}, viewer);
    expect(
      board.columns.find((c) => c.status === "NEW_CANDIDATE")!.candidates[0]!.score,
    ).toBeNull();
  });

  it("scores null when the assigned client has no rules row", async () => {
    h.clientRulesRepo.list.mockResolvedValue([]); // no rules at all
    seedBoard({ NEW_CANDIDATE: [row({ id: "norules", clientId: "cl1" })] });
    const board = await candidateService.listBoard({}, viewer);
    expect(
      board.columns.find((c) => c.status === "NEW_CANDIDATE")!.candidates[0]!.score,
    ).toBeNull();
  });

  it("scores null (not a license-only pct) when the client's rules constrain nothing", async () => {
    h.clientRulesRepo.list.mockResolvedValue([
      sterlingRules({ states: [], creds: [], pops: [], settings: [] }),
    ]);
    seedBoard({ NEW_CANDIDATE: [row({ id: "empty", clientId: "cl1", licenseStatus: "Active" })] });
    const board = await candidateService.listBoard({}, viewer);
    expect(
      board.columns.find((c) => c.status === "NEW_CANDIDATE")!.candidates[0]!.score,
    ).toBeNull();
  });
});

describe("candidateService.listBoard", () => {
  beforeEach(() => {
    seedBoard({
      NEW_CANDIDATE: [
        row({ id: "a", status: "NEW_CANDIDATE", stageOrder: 0, clientId: "cl1" }),
        row({ id: "b", status: "NEW_CANDIDATE", stageOrder: 0, stageEnteredAt: daysAgo(30) }),
      ],
      SUBMITTED_TO_CLIENT: [row({ id: "c", status: "SUBMITTED_TO_CLIENT", stageOrder: 4 })],
      NOT_QUALIFIED: [row({ id: "d", status: "NOT_QUALIFIED", stageOrder: 9 })],
      FUTURE_PIPELINE: [row({ id: "e", status: "FUTURE_PIPELINE", stageOrder: 12 })],
    });
    // meta.overdue / meta.stuck now come from targeted COUNT queries, not an in-memory scan.
    h.candidateRepo.count.mockImplementation(async (f: { overdue?: boolean; stuck?: boolean }) =>
      f.overdue ? 1 : f.stuck ? 1 : 0,
    );
  });

  it("returns exactly the 9 active columns in order 0..8, empties included (true counts)", async () => {
    const board = await candidateService.listBoard({}, viewer);
    expect(board.columns).toHaveLength(9);
    expect(board.columns.map((c) => c.stageOrder)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const newCol = board.columns.find((c) => c.status === "NEW_CANDIDATE")!;
    expect(newCol.count).toBe(2); // from the filtered groupBy
    expect(newCol.candidates).toHaveLength(2);
    expect(newCol.hasMore).toBe(false);
    expect(newCol.nextCursor).toBeNull();
    expect(board.columns.find((c) => c.status === "SUBMITTED_TO_CLIENT")!.count).toBe(1);
    expect(board.columns.find((c) => c.status === "OFFER_ACCEPTED")!.count).toBe(0);
  });

  it("summarizes the 4 terminal states (counts always; no card lists without includeTerminal)", async () => {
    const board = await candidateService.listBoard({}, viewer);
    expect(board.terminal).toHaveLength(4);
    const notQ = board.terminal.find((t) => t.status === "NOT_QUALIFIED")!;
    expect(notQ.count).toBe(1);
    expect(notQ.candidates).toBeUndefined();
  });

  it("includes terminal card lists (+ cursor) when includeTerminal is set", async () => {
    const board = await candidateService.listBoard({}, viewer, { includeTerminal: true });
    const notQ = board.terminal.find((t) => t.status === "NOT_QUALIFIED")!;
    expect(notQ.candidates).toHaveLength(1);
    expect(notQ.hasMore).toBe(false);
  });

  it("computes meta: total/active from the groupBy, overdue/stuck from count queries", async () => {
    const board = await candidateService.listBoard({}, viewer);
    // groupBy totals: 2 NEW + 1 SUBMITTED + 1 NOT_QUALIFIED + 1 FUTURE = 5 total, 3 active.
    expect(board.meta).toEqual({ total: 5, active: 3, overdue: 1, stuck: 1 });
  });

  it("resolves clientName from the batch-loaded map and never exposes licenseNumber", async () => {
    const board = await candidateService.listBoard({}, viewer);
    const cards = board.columns.find((c) => c.status === "NEW_CANDIDATE")!.candidates;
    const withClient = cards.find((c) => c.id === "a")!;
    expect(withClient.clientName).toBe("Sterling Institute");
    expect(cards.find((c) => c.id === "b")!.clientName).toBeNull();
    expect(withClient).not.toHaveProperty("licenseNumber");
  });

  it("a status filter focuses ONE column — only that column's query runs, with shared filters", async () => {
    await candidateService.listBoard(
      { track: "Operations", clientId: "cl1", search: "jane", status: "NEW_CANDIDATE" },
      viewer,
    );
    // Focus → exactly one per-column read (the other 8 short-circuit to []).
    expect(h.candidateRepo.list).toHaveBeenCalledTimes(1);
    const [args] = h.candidateRepo.list.mock.calls[0]!;
    expect(args).toMatchObject({
      track: "Operations",
      clientId: "cl1",
      search: "jane",
      status: "NEW_CANDIDATE",
      orderBy: "createdAt_desc",
      take: 26, // BOARD_PAGE (25) + 1
    });
  });

  it("paginates a column at BOARD_PAGE (25) with the TRUE total from groupBy", async () => {
    const many = Array.from({ length: 26 }, (_, i) =>
      row({ id: `n${i}`, status: "NEW_CANDIDATE", stageOrder: 0 }),
    );
    h.candidateRepo.list.mockImplementation(async (f: { status?: string }) =>
      f.status === "NEW_CANDIDATE" ? many : [],
    );
    h.candidateRepo.groupByStatusFiltered.mockResolvedValue([
      { status: "NEW_CANDIDATE", _count: { _all: 60 } },
    ]);
    const board = await candidateService.listBoard({}, viewer);
    const newCol = board.columns.find((c) => c.status === "NEW_CANDIDATE")!;
    expect(newCol.count).toBe(60); // true total
    expect(newCol.candidates).toHaveLength(25); // one keyset page
    expect(newCol.hasMore).toBe(true);
    expect(decodeCursor(newCol.nextCursor!, "createdAt_desc")!.id).toBe("n24"); // last of page
    expect(board.meta.total).toBe(60);
  });
});

describe("candidateService.listColumn (per-column load-more)", () => {
  it("returns a ColumnPageDTO for one status, walking the cursor + resolving mine", async () => {
    const many = Array.from({ length: 26 }, (_, i) =>
      row({ id: `s${i}`, status: "INITIAL_SCREENING", stageOrder: 2 }),
    );
    h.candidateRepo.list.mockResolvedValue(many);
    const page = await candidateService.listColumn("INITIAL_SCREENING", { mine: true }, viewer, {
      kind: "createdAt",
      value: "2026-06-01T00:00:00.000Z",
      id: "s0",
    });
    expect(page.status).toBe("INITIAL_SCREENING");
    expect(page.items).toHaveLength(25);
    expect(page.hasMore).toBe(true);
    expect(decodeCursor(page.nextCursor!, "createdAt_desc")!.id).toBe("s24");
    const [args] = h.candidateRepo.list.mock.calls[0]!;
    expect(args).toMatchObject({
      status: "INITIAL_SCREENING",
      orderBy: "createdAt_desc",
      take: 26,
    });
    expect(args.createdById).toBe("u1"); // mine → viewer.id
    expect(args.cursor).toMatchObject({ id: "s0" });
  });

  it("last page → hasMore false, nextCursor null", async () => {
    h.candidateRepo.list.mockResolvedValue([
      row({ id: "only", status: "DESTA_REVIEW", stageOrder: 3 }),
    ]);
    const page = await candidateService.listColumn("DESTA_REVIEW", {}, viewer);
    expect(page.items).toHaveLength(1);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });
});

describe("candidateService.dashboardStats", () => {
  beforeEach(() => {
    // Per-status counts come from a groupBy — NOT a full-table load.
    h.candidateRepo.groupByStatus.mockResolvedValue([
      { status: "NEW_CANDIDATE", _count: { _all: 5 } },
      { status: "SUBMITTED_TO_CLIENT", _count: { _all: 3 } },
      { status: "NOT_QUALIFIED", _count: { _all: 2 } }, // terminal
    ]);
    // A small targeted read of the oldest-in-stage active candidates.
    h.candidateRepo.listStaleActive.mockResolvedValue([
      row({ id: "old", status: "NEW_CANDIDATE", stageOrder: 0, stageEnteredAt: daysAgo(30) }),
      row({ id: "fresh", status: "NEW_CANDIDATE", stageOrder: 0 }),
    ]);
  });

  it("derives total/active/terminal from the groupBy (no full-table load)", async () => {
    const stats = await candidateService.dashboardStats(viewer);
    expect(h.candidateRepo.list).not.toHaveBeenCalled();
    expect(stats.total).toBe(10);
    expect(stats.active).toBe(8); // 5 + 3
    expect(stats.terminal).toBe(2); // NOT_QUALIFIED
  });

  it("builds the 9 active funnel columns from the per-status counts", async () => {
    const stats = await candidateService.dashboardStats(viewer);
    expect(stats.columns).toHaveLength(9);
    expect(stats.columns.find((c) => c.status === "NEW_CANDIDATE")!.count).toBe(5);
    expect(stats.columns.find((c) => c.status === "SUBMITTED_TO_CLIENT")!.count).toBe(3);
    expect(stats.columns.find((c) => c.status === "OFFER_ACCEPTED")!.count).toBe(0);
  });

  it("surfaces only overdue/stuck candidates from the targeted stale read", async () => {
    const stats = await candidateService.dashboardStats(viewer);
    expect(stats.attention.map((c) => c.id)).toEqual(["old"]);
    expect(h.candidateRepo.listStaleActive).toHaveBeenCalledWith(8);
  });
});
