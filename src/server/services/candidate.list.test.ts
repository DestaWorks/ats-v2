import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AuthUser } from "@/server/auth/guards";

/**
 * Proves `candidateService.listCandidates` builds the PII-gated `/candidates` browse list WITHOUT a
 * DB: rows carry NO `licenseNumber` (the projection runs through `toCandidateDTO`, even for a viewer
 * WITH `viewCredentials`), the read is CAPPED at 100 rows via the repository `take` (and `capped`
 * flips when the ceiling is hit), `clientName` resolves from the batch-loaded client map, and the
 * caller's filters are forwarded verbatim. We mock the two repositories; the DTO + timing run for real.
 */

const h = vi.hoisted(() => ({
  candidateRepo: { list: vi.fn() },
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

/** A candidate row with the fields the list DTO + timing read (incl. sensitive `licenseNumber`). */
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
  h.clientRulesRepo.list.mockResolvedValue([]);
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
    const list = await candidateService.listCandidates({}, associate);
    expect(list.candidates[0]!.clientName).toBeNull();
  });

  it("caps the read at 100 rows via the repository `take` and forwards filters verbatim", async () => {
    h.candidateRepo.list.mockResolvedValue([row()]);
    await candidateService.listCandidates(
      { track: "Operations", status: "NEW_CANDIDATE", clientId: "cl1", search: "jane" },
      associate,
    );
    expect(h.candidateRepo.list).toHaveBeenCalledWith({
      track: "Operations",
      status: "NEW_CANDIDATE",
      clientId: "cl1",
      search: "jane",
      take: 100,
    });
  });

  it("folds the fit pct onto each list item and sorts by score desc (nulls last)", async () => {
    h.clientRulesRepo.list.mockResolvedValue([sterlingRules()]);
    // Repo returns createdAt-desc; the service re-sorts by score. Intentionally UNSORTED input.
    h.candidateRepo.list.mockResolvedValue([
      row({
        id: "mid",
        clientId: "cl1",
        licenseState: "NJ",
        credential: "PMHNP",
        population: "Adult",
        setting: "Telehealth",
        licenseStatus: "Active",
      }), // 40
      row({ id: "nul", clientId: null }), // null (no client)
      row({
        id: "hi",
        clientId: "cl1",
        licenseState: "CT",
        credential: "PMHNP",
        population: "Child/Adolescent",
        setting: "Hybrid",
        licenseStatus: "Active",
      }), // 100
    ]);
    const list = await candidateService.listCandidates({}, associate);
    expect(list.candidates.map((c) => c.id)).toEqual(["hi", "mid", "nul"]);
    expect(list.candidates.map((c) => c.score)).toEqual([100, 40, null]);
  });

  it("keeps the repository createdAt-desc order for equal scores (stable sort)", async () => {
    h.clientRulesRepo.list.mockResolvedValue([sterlingRules()]);
    // Two identical-fit candidates (both 40): the repo's createdAt-desc order must be preserved.
    const eq = (id: string) =>
      row({
        id,
        clientId: "cl1",
        licenseState: "NJ",
        credential: "PMHNP",
        population: "Adult",
        setting: "Telehealth",
        licenseStatus: "Active",
      });
    h.candidateRepo.list.mockResolvedValue([eq("first"), eq("second")]);
    const list = await candidateService.listCandidates({}, associate);
    expect(list.candidates.map((c) => c.id)).toEqual(["first", "second"]);
    expect(list.candidates.every((c) => c.score === 40)).toBe(true);
  });

  it("scores null when the assigned client has no rules row", async () => {
    h.clientRulesRepo.list.mockResolvedValue([]); // no rules seeded
    h.candidateRepo.list.mockResolvedValue([row({ id: "x", clientId: "cl1" })]);
    const list = await candidateService.listCandidates({}, associate);
    expect(list.candidates[0]!.score).toBeNull();
  });

  it("reports capped=false below the cap and capped=true at the ceiling", async () => {
    h.candidateRepo.list.mockResolvedValueOnce([row(), row()]);
    const under = await candidateService.listCandidates({}, associate);
    expect(under.count).toBe(2);
    expect(under.capped).toBe(false);

    h.candidateRepo.list.mockResolvedValueOnce(
      Array.from({ length: 100 }, (_, i) => row({ id: `c${i}` })),
    );
    const full = await candidateService.listCandidates({}, associate);
    expect(full.count).toBe(100);
    expect(full.capped).toBe(true);
  });
});
