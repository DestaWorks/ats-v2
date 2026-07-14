import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AuthUser } from "@/server/auth/guards";

/**
 * Proves `candidateService.listCandidates` builds the PII-gated `/candidates` browse list WITHOUT a
 * DB, resolving EVERYTHING server-side:
 *  - rows carry NO `licenseNumber` (projection runs through `toCandidateDTO`, even WITH viewCredentials);
 *  - the **DB path** (newest/oldest, Hot off) paginates in SQL — `count` + a `skip`/`take` page,
 *    preserving DB order (score is a displayed column);
 *  - the **score path** (`sort: "fit"` or `hot: true`) loads the full filtered set, scores it, and
 *    filters/sorts/slices in memory (`take`/`skip` NOT sent to the repo, no `count` query);
 *  - `page` is clamped to `[1, totalPages]`; `mine` resolves to `viewer.id` server-side.
 * We mock the repositories; the DTO + timing + scoring run for real.
 */

const h = vi.hoisted(() => ({
  candidateRepo: { list: vi.fn(), count: vi.fn() },
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

const PAGE_SIZE = 25;

const associate: AuthUser = { id: "u1", email: "u@desta.works", name: "U", role: "Associate" };
const owner: AuthUser = { id: "o1", email: "o@desta.works", name: "O", role: "Owner" };

const DAY = 86_400_000;

/** A candidate row with the fields the list DTO + timing + scoring read (incl. sensitive PII). */
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

beforeEach(() => {
  h.candidateRepo.list.mockReset().mockResolvedValue([]);
  h.candidateRepo.count.mockReset().mockResolvedValue(0);
  h.clientRepo.list.mockReset().mockResolvedValue([{ id: "cl1", name: "Sterling Institute" }]);
  h.clientRulesRepo.list.mockReset().mockResolvedValue([]);
});

/** A `client_rules` row for `cl1` = Sterling Institute. */
function sterlingRules() {
  return {
    id: "r1",
    clientId: "cl1",
    states: ["CT"],
    creds: ["PMHNP", "MD"],
    pops: ["Child/Adolescent"],
    settings: ["Hybrid", "Outpatient"],
    priority: "HIGH",
    autoDisqualify: [],
  };
}

/** DB order [mid=40, nul=null, hi=100] against Sterling's rules — used by the sort/hot tests. */
function threeScored() {
  return [
    row({
      id: "mid",
      clientId: "cl1",
      licenseState: "NJ",
      credential: "PMHNP",
      population: "Adult",
      setting: "Telehealth",
      licenseStatus: "Active",
    }),
    row({ id: "nul", clientId: null }),
    row({
      id: "hi",
      clientId: "cl1",
      licenseState: "CT",
      credential: "PMHNP",
      population: "Child/Adolescent",
      setting: "Hybrid",
      licenseStatus: "Active",
    }),
  ];
}

describe("candidateService.listCandidates — DB path (newest/oldest)", () => {
  it("maps rows to PII-gated list items (never licenseNumber, even WITH viewCredentials)", async () => {
    h.candidateRepo.list.mockResolvedValue([
      row({ id: "a", clientId: "cl1", stageEnteredAt: new Date(Date.now() - 5 * DAY) }),
    ]);
    h.candidateRepo.count.mockResolvedValue(1);
    const list = await candidateService.listCandidates({}, owner);
    expect(list.candidates).toHaveLength(1);
    const item = list.candidates[0]!;
    expect(item).not.toHaveProperty("licenseNumber");
    expect(item.statusLabel).toBe("New Candidate");
    expect(item.clientName).toBe("Sterling Institute");
    expect(item.daysInStage).toBe(5);
  });

  it("resolves clientName to null when the candidate has no client", async () => {
    h.candidateRepo.list.mockResolvedValue([row({ id: "b", clientId: null })]);
    h.candidateRepo.count.mockResolvedValue(1);
    const list = await candidateService.listCandidates({}, associate);
    expect(list.candidates[0]!.clientName).toBeNull();
  });

  it("paginates in SQL — default page 1 → skip 0, take pageSize, createdAt_desc, no cursor/keyset", async () => {
    h.candidateRepo.list.mockResolvedValue([row()]);
    h.candidateRepo.count.mockResolvedValue(1);
    await candidateService.listCandidates(
      { track: "Operations", status: "NEW_CANDIDATE", clientId: "cl1", search: "jane" },
      associate,
    );
    const [args] = h.candidateRepo.list.mock.calls[0]!;
    expect(args).toMatchObject({
      track: "Operations",
      status: "NEW_CANDIDATE",
      clientId: "cl1",
      search: "jane",
      orderBy: "createdAt_desc",
      skip: 0,
      take: PAGE_SIZE,
    });
    expect(args.cursor).toBeUndefined();
  });

  it("page 2 → skip = pageSize; reports offset pager meta", async () => {
    h.candidateRepo.list.mockResolvedValue([row()]);
    h.candidateRepo.count.mockResolvedValue(100);
    const list = await candidateService.listCandidates({ page: 2 }, associate);
    const [args] = h.candidateRepo.list.mock.calls[0]!;
    expect(args.skip).toBe(PAGE_SIZE);
    expect(list).toMatchObject({
      total: 100,
      page: 2,
      pageSize: PAGE_SIZE,
      totalPages: 4,
      hasPrev: true,
      hasNext: true,
    });
  });

  it("clamps an out-of-range page down to the last page", async () => {
    h.candidateRepo.list.mockResolvedValue([row()]);
    h.candidateRepo.count.mockResolvedValue(10); // 1 page at pageSize 25
    const list = await candidateService.listCandidates({ page: 5 }, associate);
    const [args] = h.candidateRepo.list.mock.calls[0]!;
    expect(args.skip).toBe(0);
    expect(list.page).toBe(1);
    expect(list.hasNext).toBe(false);
  });

  it("maps sort=oldest → createdAt_asc", async () => {
    h.candidateRepo.list.mockResolvedValue([row()]);
    h.candidateRepo.count.mockResolvedValue(1);
    await candidateService.listCandidates({ sort: "oldest" }, associate);
    expect(h.candidateRepo.list.mock.calls[0]![0].orderBy).toBe("createdAt_asc");
  });

  it("folds the fit pct onto each item WITHOUT re-sorting — order stays the DB order", async () => {
    h.clientRulesRepo.list.mockResolvedValue([sterlingRules()]);
    h.candidateRepo.list.mockResolvedValue(threeScored());
    h.candidateRepo.count.mockResolvedValue(3);
    const list = await candidateService.listCandidates({}, associate);
    expect(list.candidates.map((c) => c.id)).toEqual(["mid", "nul", "hi"]); // DB order
    expect(list.candidates.map((c) => c.score)).toEqual([40, null, 100]);
  });

  it("scores null when the assigned client has no rules row", async () => {
    h.clientRulesRepo.list.mockResolvedValue([]);
    h.candidateRepo.list.mockResolvedValue([row({ id: "x", clientId: "cl1" })]);
    h.candidateRepo.count.mockResolvedValue(1);
    const list = await candidateService.listCandidates({}, associate);
    expect(list.candidates[0]!.score).toBeNull();
  });

  it("carries ADVISORY dqFlags — license reasons without a client, state mismatch with rules", async () => {
    h.clientRulesRepo.list.mockResolvedValue([sterlingRules()]);
    h.candidateRepo.list.mockResolvedValue([
      row({ id: "expired", clientId: null, licenseStatus: "Expired" }),
      row({ id: "mismatch", clientId: "cl1", licenseState: "NJ" }), // Sterling wants CT
      row({ id: "clean", clientId: "cl1", licenseState: "CT" }),
    ]);
    h.candidateRepo.count.mockResolvedValue(3);
    const list = await candidateService.listCandidates({}, associate);
    const byId = new Map(list.candidates.map((c) => [c.id, c.dqFlags]));
    expect(byId.get("expired")).toEqual(["License expired"]); // no client needed
    expect(byId.get("mismatch")![0]).toMatch(/License state \(NJ\) does not match/);
    expect(byId.get("clean")).toEqual([]);
  });

  it("resolves `mine` to viewer.id server-side (never a client-supplied id)", async () => {
    await candidateService.listCandidates({ mine: true, sort: "oldest" }, associate);
    const [args] = h.candidateRepo.list.mock.calls[0]!;
    expect(args.createdById).toBe("u1");
    expect(args.orderBy).toBe("createdAt_asc");
  });

  it("maps source/owner/date-range filters — UTC day-bounds, mine wins over ownerId", async () => {
    await candidateService.listCandidates(
      {
        source: "LinkedIn",
        ownerId: "other-user",
        addedFrom: new Date("2026-06-01T15:30:00.000Z"),
        addedTo: new Date("2026-06-30T04:00:00.000Z"),
      },
      associate,
    );
    const [args] = h.candidateRepo.list.mock.calls[0]!;
    expect(args.source).toBe("LinkedIn");
    expect(args.createdById).toBe("other-user"); // explicit view-as owner
    expect(args.addedFrom).toEqual(new Date("2026-06-01T00:00:00.000Z")); // widened to day start
    expect(args.addedTo).toEqual(new Date("2026-07-01T00:00:00.000Z")); // exclusive next-day start

    h.candidateRepo.list.mockClear();
    await candidateService.listCandidates({ ownerId: "other-user", mine: true }, associate);
    expect(h.candidateRepo.list.mock.calls[0]![0].createdById).toBe("u1"); // mine wins
  });
});

describe("candidateService.listCandidates — score path (fit / hot)", () => {
  it("sort=fit loads the FULL filtered set (no skip/take, no count) and sorts by score desc, nulls last", async () => {
    h.clientRulesRepo.list.mockResolvedValue([sterlingRules()]);
    h.candidateRepo.list.mockResolvedValue(threeScored());
    const list = await candidateService.listCandidates({ sort: "fit" }, associate);
    expect(list.candidates.map((c) => c.id)).toEqual(["hi", "mid", "nul"]); // score desc, nulls last
    expect(list.candidates.map((c) => c.score)).toEqual([100, 40, null]);
    expect(list.total).toBe(3);
    const [args] = h.candidateRepo.list.mock.calls[0]!;
    expect(args.skip).toBeUndefined();
    expect(args.take).toBeUndefined();
    expect(h.candidateRepo.count).not.toHaveBeenCalled();
  });

  it("hot filters to score ≥ HOT_SCORE across the whole set; total is the hot count", async () => {
    h.clientRulesRepo.list.mockResolvedValue([sterlingRules()]);
    h.candidateRepo.list.mockResolvedValue(threeScored());
    const list = await candidateService.listCandidates({ hot: true }, associate);
    expect(list.candidates.map((c) => c.id)).toEqual(["hi"]); // only 100 ≥ 80
    expect(list.total).toBe(1);
    expect(h.candidateRepo.count).not.toHaveBeenCalled();
  });

  it("hot + fit compose, and the page clamps to the filtered length", async () => {
    h.clientRulesRepo.list.mockResolvedValue([sterlingRules()]);
    h.candidateRepo.list.mockResolvedValue(threeScored());
    const list = await candidateService.listCandidates(
      { hot: true, sort: "fit", page: 9 },
      associate,
    );
    expect(list.candidates.map((c) => c.id)).toEqual(["hi"]);
    expect(list.page).toBe(1);
    expect(list.totalPages).toBe(1);
  });
});
