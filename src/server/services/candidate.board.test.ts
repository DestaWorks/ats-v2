import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AuthUser } from "@/server/auth/guards";

/**
 * Proves `candidateService.listBoard` groups candidates into the funnel board WITHOUT a DB: the 9
 * active stages are always present (empties included, order 0..8), terminal states are summarized
 * (counts always; card lists only when `includeTerminal`), stage timing (overdue/stuck/daysInStage)
 * is derived from `stageEnteredAt`, `clientName` is resolved from the batch-loaded client map, and
 * a card NEVER carries `licenseNumber`. We mock the two repositories; timing + the PII DTO run for real.
 */

const h = vi.hoisted(() => ({
  candidateRepo: {
    list: vi.fn(),
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
  // Mock only the Prisma-touching `list`; the pure `toClientRules` mapper runs for real.
  return { ...actual, clientRulesRepository: h.clientRulesRepo };
});

import { candidateService } from "./candidate.service";

const viewer: AuthUser = { id: "u1", email: "u@desta.works", name: "U", role: "Associate" };

const DAY = 86_400_000;
function daysAgo(n: number) {
  return new Date(Date.now() - n * DAY);
}

/** A candidate row with the fields the DTO + timing read (incl. sensitive `licenseNumber`). */
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
    ...overrides,
  };
}

beforeEach(() => {
  h.candidateRepo.list.mockReset();
  h.clientRepo.list.mockReset();
  h.clientRulesRepo.list.mockReset();
  h.clientRepo.list.mockResolvedValue([{ id: "cl1", name: "Sterling Institute" }]);
  // Default: no rules seeded → every card scores null (existing assertions are score-agnostic).
  h.clientRulesRepo.list.mockResolvedValue([]);
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
    h.candidateRepo.list.mockResolvedValue([
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
      // Mismatch on state + population + setting: only credential (30) + license (10) = 40/100.
      row({
        id: "partial",
        clientId: "cl1",
        licenseState: "NJ",
        credential: "PMHNP",
        population: "Adult",
        setting: "Telehealth",
        licenseStatus: "Active",
      }),
    ]);
    const board = await candidateService.listBoard({}, viewer);
    const cards = board.columns.find((c) => c.status === "NEW_CANDIDATE")!.candidates;
    expect(cards.find((c) => c.id === "full")!.score).toBe(100);
    expect(cards.find((c) => c.id === "partial")!.score).toBe(40);
  });

  it("scores null when the candidate has no client", async () => {
    h.clientRulesRepo.list.mockResolvedValue([sterlingRules()]);
    h.candidateRepo.list.mockResolvedValue([row({ id: "noclient", clientId: null })]);
    const board = await candidateService.listBoard({}, viewer);
    const card = board.columns.find((c) => c.status === "NEW_CANDIDATE")!.candidates[0]!;
    expect(card.score).toBeNull();
  });

  it("scores null when the assigned client has no rules row", async () => {
    h.clientRulesRepo.list.mockResolvedValue([]); // no rules at all
    h.candidateRepo.list.mockResolvedValue([row({ id: "norules", clientId: "cl1" })]);
    const board = await candidateService.listBoard({}, viewer);
    const card = board.columns.find((c) => c.status === "NEW_CANDIDATE")!.candidates[0]!;
    expect(card.score).toBeNull();
  });

  it("scores null (not a license-only pct) when the client's rules constrain nothing", async () => {
    // Empty-rules client (e.g. Future Potential Clients): all four matchable arrays empty. The pure
    // rule would still score the license floor (max 10), but `scoreFor` reports null because there's
    // no client-SPECIFIC fit to show — even for an Active-license candidate that would otherwise be 100%.
    h.clientRulesRepo.list.mockResolvedValue([
      sterlingRules({ states: [], creds: [], pops: [], settings: [] }),
    ]);
    h.candidateRepo.list.mockResolvedValue([
      row({ id: "empty", clientId: "cl1", licenseStatus: "Active" }),
    ]);
    const board = await candidateService.listBoard({}, viewer);
    const card = board.columns.find((c) => c.status === "NEW_CANDIDATE")!.candidates[0]!;
    expect(card.score).toBeNull();
  });
});

describe("candidateService.listBoard", () => {
  beforeEach(() => {
    h.candidateRepo.list.mockResolvedValue([
      row({ id: "a", status: "NEW_CANDIDATE", stageOrder: 0, clientId: "cl1" }),
      // 30 days in NEW_CANDIDATE (SLA 3) → overdue AND stuck.
      row({ id: "b", status: "NEW_CANDIDATE", stageOrder: 0, stageEnteredAt: daysAgo(30) }),
      row({ id: "c", status: "SUBMITTED_TO_CLIENT", stageOrder: 4 }),
      row({ id: "d", status: "NOT_QUALIFIED", stageOrder: 9 }),
      row({ id: "e", status: "FUTURE_PIPELINE", stageOrder: 12, stageEnteredAt: daysAgo(30) }),
    ]);
  });

  it("returns exactly the 9 active columns in order 0..8, empties included", async () => {
    const board = await candidateService.listBoard({}, viewer);
    expect(board.columns).toHaveLength(9);
    expect(board.columns.map((c) => c.stageOrder)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);

    const newCol = board.columns.find((c) => c.status === "NEW_CANDIDATE")!;
    expect(newCol.count).toBe(2);
    expect(newCol.candidates).toHaveLength(2);
    expect(board.columns.find((c) => c.status === "SUBMITTED_TO_CLIENT")!.count).toBe(1);
    // An empty active stage is still present with a zero count.
    expect(board.columns.find((c) => c.status === "OFFER_ACCEPTED")!.count).toBe(0);
  });

  it("summarizes the 4 terminal states (counts always; no card lists without includeTerminal)", async () => {
    const board = await candidateService.listBoard({}, viewer);
    expect(board.terminal).toHaveLength(4);
    const notQ = board.terminal.find((t) => t.status === "NOT_QUALIFIED")!;
    expect(notQ.count).toBe(1);
    expect(notQ.candidates).toBeUndefined();
  });

  it("includes terminal card lists when includeTerminal is set", async () => {
    const board = await candidateService.listBoard({}, viewer, { includeTerminal: true });
    const notQ = board.terminal.find((t) => t.status === "NOT_QUALIFIED")!;
    expect(notQ.candidates).toHaveLength(1);
  });

  it("computes meta (total/active/overdue/stuck) over active cards only", async () => {
    const board = await candidateService.listBoard({}, viewer);
    // 5 total, 3 active (2 NEW + 1 SUBMITTED); the 30-day NEW card is both overdue and stuck.
    expect(board.meta).toEqual({ total: 5, active: 3, overdue: 1, stuck: 1 });
  });

  it("resolves clientName from the batch-loaded map and never exposes licenseNumber", async () => {
    const board = await candidateService.listBoard({}, viewer);
    const cards = board.columns.find((c) => c.status === "NEW_CANDIDATE")!.candidates;
    const withClient = cards.find((c) => c.id === "a")!;
    expect(withClient.clientName).toBe("Sterling Institute");
    expect(cards.find((c) => c.id === "b")!.clientName).toBeNull();
    // The card projection structurally omits licenseNumber regardless of viewer role.
    expect(withClient).not.toHaveProperty("licenseNumber");
  });

  it("forwards filters to the repository list", async () => {
    await candidateService.listBoard(
      { track: "Operations", clientId: "cl1", search: "jane", status: "NEW_CANDIDATE" },
      viewer,
    );
    expect(h.candidateRepo.list).toHaveBeenCalledWith({
      track: "Operations",
      clientId: "cl1",
      search: "jane",
      status: "NEW_CANDIDATE",
    });
  });

  it("caps a column's cards at 50 but reports the TRUE total count", async () => {
    // 60 candidates all in NEW_CANDIDATE — more than the per-column cap.
    const many = Array.from({ length: 60 }, (_, i) =>
      row({ id: `n${i}`, status: "NEW_CANDIDATE", stageOrder: 0 }),
    );
    h.candidateRepo.list.mockResolvedValue(many);
    const board = await candidateService.listBoard({}, viewer);
    const newCol = board.columns.find((c) => c.status === "NEW_CANDIDATE")!;
    expect(newCol.count).toBe(60); // true total
    expect(newCol.candidates).toHaveLength(50); // capped payload
    expect(board.meta.total).toBe(60);
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
    // The 30-day-old NEW card is overdue/stuck; the fresh one is not.
    expect(stats.attention.map((c) => c.id)).toEqual(["old"]);
    expect(h.candidateRepo.listStaleActive).toHaveBeenCalledWith(8);
  });
});
