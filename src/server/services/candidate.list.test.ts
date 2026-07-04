import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AuthUser } from "@/server/auth/guards";
import { decodeCursor } from "@/lib/validation/cursor";

/**
 * Proves `candidateService.listCandidates` builds the PII-gated, CURSOR-PAGINATED `/candidates`
 * browse list WITHOUT a DB: rows carry NO `licenseNumber` (the projection runs through
 * `toCandidateDTO`, even for a viewer WITH `viewCredentials`), the read fetches `LIST_PAGE + 1` rows
 * (keyset, default `createdAt desc`) so `hasMore`/`nextCursor`/`total` are exact, there is
 * DELIBERATELY NO global score sort (order == DB order — score is a displayed column), `mine`
 * resolves to `viewer.id` server-side, and `clientName` resolves from the batch-loaded client map.
 * We mock the repositories; the DTO + timing + cursor codec run for real.
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

const associate: AuthUser = { id: "u1", email: "u@desta.works", name: "U", role: "Associate" };
const owner: AuthUser = { id: "o1", email: "o@desta.works", name: "O", role: "Owner" };

const DAY = 86_400_000;

/** A candidate row with the fields the list DTO + timing + cursor read (incl. sensitive PII). */
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

describe("candidateService.listCandidates", () => {
  it("maps rows to PII-gated list items (never licenseNumber, even WITH viewCredentials)", async () => {
    h.candidateRepo.list.mockResolvedValue([
      row({ id: "a", clientId: "cl1", stageEnteredAt: new Date(Date.now() - 5 * DAY) }),
    ]);
    h.candidateRepo.count.mockResolvedValue(1);
    // Owner HAS viewCredentials — the row still structurally omits licenseNumber.
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

  it("fetches LIST_PAGE+1 with default createdAt_desc + no cursor; forwards filters", async () => {
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
      take: 51, // LIST_PAGE (50) + 1
    });
    expect(args.cursor).toBeUndefined();
  });

  it("returns total from the count query (true filtered denominator)", async () => {
    h.candidateRepo.list.mockResolvedValue([row()]);
    h.candidateRepo.count.mockResolvedValue(347);
    const list = await candidateService.listCandidates({}, associate);
    expect(list.total).toBe(347);
  });

  it("folds the fit pct onto each item WITHOUT re-sorting — order stays the DB order", async () => {
    h.clientRulesRepo.list.mockResolvedValue([sterlingRules()]);
    // DB order is [mid(40), nul(null), hi(100)]. A score sort would flip it to [hi, mid, nul];
    // the new list must preserve the DB order (score is a displayed column, not the paginate key).
    h.candidateRepo.list.mockResolvedValue([
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
    ]);
    h.candidateRepo.count.mockResolvedValue(3);
    const list = await candidateService.listCandidates({}, associate);
    expect(list.candidates.map((c) => c.id)).toEqual(["mid", "nul", "hi"]); // DB order
    expect(list.candidates.map((c) => c.score)).toEqual([40, null, 100]); // scores still shown
  });

  it("scores null when the assigned client has no rules row", async () => {
    h.clientRulesRepo.list.mockResolvedValue([]); // no rules seeded
    h.candidateRepo.list.mockResolvedValue([row({ id: "x", clientId: "cl1" })]);
    h.candidateRepo.count.mockResolvedValue(1);
    const list = await candidateService.listCandidates({}, associate);
    expect(list.candidates[0]!.score).toBeNull();
  });

  it("hasMore + nextCursor at a full page; sliced to LIST_PAGE (capped mirrors hasMore)", async () => {
    const rows = Array.from({ length: 51 }, (_, i) => row({ id: `c${i}` }));
    h.candidateRepo.list.mockResolvedValue(rows);
    h.candidateRepo.count.mockResolvedValue(200);
    const list = await candidateService.listCandidates({}, associate);
    expect(list.candidates).toHaveLength(50);
    expect(list.hasMore).toBe(true);
    expect(list.total).toBe(200);
    // nextCursor targets the LAST returned row (index 49), not the dropped 51st.
    expect(decodeCursor(list.nextCursor!, "createdAt_desc")!.id).toBe("c49");
    // Backward-compat mirror for the current RSC table.
    expect(list.count).toBe(50);
    expect(list.capped).toBe(true);
  });

  it("last page: no extra row → hasMore false, nextCursor null, capped false", async () => {
    h.candidateRepo.list.mockResolvedValue([row({ id: "a" }), row({ id: "b" })]);
    h.candidateRepo.count.mockResolvedValue(2);
    const list = await candidateService.listCandidates({}, associate);
    expect(list.hasMore).toBe(false);
    expect(list.nextCursor).toBeNull();
    expect(list.capped).toBe(false);
    expect(list.count).toBe(2);
  });

  it("resolves `mine` to viewer.id server-side and forwards sort + cursor", async () => {
    h.candidateRepo.list.mockResolvedValue([]);
    h.candidateRepo.count.mockResolvedValue(0);
    await candidateService.listCandidates(
      {
        mine: true,
        sort: "createdAt_asc",
        cursor: { kind: "createdAt", value: "2026-06-01T00:00:00.000Z", id: "x" },
      },
      associate,
    );
    const [args] = h.candidateRepo.list.mock.calls[0]!;
    expect(args.createdById).toBe("u1"); // never a client-supplied id
    expect(args.orderBy).toBe("createdAt_asc");
    expect(args.cursor).toMatchObject({ id: "x" });
  });
});
