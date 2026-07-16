import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AuthUser } from "@/server/auth/guards";
import type { SaveScreeningInput } from "@/lib/validation/screening";

/**
 * Proves the screening save+conditional-move composition WITHOUT a DB. The pure `scoreScreening`
 * rules run for real; `candidateRepository`, `clientRepository`, `clientRulesRepository`,
 * `screeningRepository`, `writeAudit`, `withTransaction`, and `candidateService.move` are mocked —
 * `move` especially, so a real stage transition never actually runs here (it's unit-tested on its
 * own in `candidate.service.test.ts`).
 */

const h = vi.hoisted(() => ({
  fakeTx: { __tx: true },
  user: { id: "u1", email: "u@desta.works", name: "Test User", role: "Associate" as const },
  candidateRepo: { list: vi.fn(), findById: vi.fn() },
  clientRepo: { nameMap: vi.fn() },
  clientRulesRepo: { list: vi.fn() },
  screeningRepo: { create: vi.fn(), listByCandidate: vi.fn() },
  candidateService: { move: vi.fn() },
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/repositories/candidate.repository", () => ({
  candidateRepository: h.candidateRepo,
}));
vi.mock("@/server/repositories/client.repository", () => ({ clientRepository: h.clientRepo }));
vi.mock("@/server/repositories/client-rules.repository", () => ({
  clientRulesRepository: h.clientRulesRepo,
}));
vi.mock("@/server/repositories/screening.repository", () => ({
  screeningRepository: h.screeningRepo,
}));
vi.mock("./candidate.service", () => ({ candidateService: h.candidateService }));
vi.mock("@/server/db/audit", () => ({ writeAudit: h.writeAudit }));
vi.mock("@/server/db/with-transaction", () => ({
  withTransaction: (fn: (tx: unknown) => unknown) => fn(h.fakeTx),
}));

import { screeningService } from "./screening.service";

const user = h.user as AuthUser;

function candidateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    name: "Jane Doe",
    credential: "PMHNP",
    licenseState: "CT",
    status: "INITIAL_SCREENING",
    clientId: "cl1",
    yearsExp: 5,
    ...overrides,
  };
}

type ScorecardFields = Omit<SaveScreeningInput, "action">;

/** A scorecard input that scores 100% (all sections maxed) — see screening.test.ts's "Advance"
 *  scenario for the exact composition. */
const HIGH_SCORE_INPUT: ScorecardFields = {
  credentialsHeld: [
    "Active RN License",
    "PMHNP Certification",
    "NP License",
    "DEA Registration",
    "Collaborative Agreement (if required by state)",
    "ANCC Board Certification",
    "Prescriptive Authority",
    "CPR/BLS",
    "Malpractice Insurance",
  ],
  statesHeld: ["CT"],
  yearsExp: 5,
  schedule: "Flexible / Open to Anything",
  salaryAsk: 140000,
  commChecklist: [
    "respond24",
    "profEmail",
    "onTime",
    "clearEnglish",
    "preparedQuestions",
    "noRedFlags",
    "genuineInterest",
  ],
  notes: null,
};

/** A scorecard input that scores 0% (everything empty/unmapped). */
const LOW_SCORE_INPUT: ScorecardFields = {
  credentialsHeld: [],
  statesHeld: [],
  yearsExp: 0,
  schedule: null,
  salaryAsk: null,
  commChecklist: [],
  notes: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  h.candidateRepo.findById.mockResolvedValue(candidateRow());
  h.clientRulesRepo.list.mockResolvedValue([{ clientId: "cl1", states: ["CT"], schedule: null }]);
  h.screeningRepo.create.mockImplementation((data: Record<string, unknown>) =>
    Promise.resolve({ id: "sc1", scoredAt: new Date("2026-07-16T00:00:00Z"), ...data }),
  );
});

describe("screeningService.saveAndMaybeMove", () => {
  it("action:advance at a passing score calls move(SUBMITTED_TO_CLIENT) after persisting the scorecard", async () => {
    h.candidateService.move.mockResolvedValue({ status: "SUBMITTED_TO_CLIENT" });
    const dto = await screeningService.saveAndMaybeMove(
      "c1",
      { ...HIGH_SCORE_INPUT, action: "advance" },
      user,
    );
    expect(dto.result.totalPct).toBe(100);
    expect(dto.result.decision).toBe("Advance");
    expect(h.screeningRepo.create).toHaveBeenCalled();
    expect(h.candidateService.move).toHaveBeenCalledWith("c1", "SUBMITTED_TO_CLIENT", user);
    expect(dto.moved).toEqual({ toStatus: "SUBMITTED_TO_CLIENT" });
    // scorecard created BEFORE move is called
    const createOrder = h.screeningRepo.create.mock.invocationCallOrder[0]!;
    const moveOrder = h.candidateService.move.mock.invocationCallOrder[0]!;
    expect(createOrder).toBeLessThan(moveOrder);
  });

  it("action:advance below 75% throws BAD_REQUEST and never calls move", async () => {
    await expect(
      screeningService.saveAndMaybeMove("c1", { ...LOW_SCORE_INPUT, action: "advance" }, user),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(h.candidateService.move).not.toHaveBeenCalled();
    expect(h.screeningRepo.create).not.toHaveBeenCalled();
  });

  it("action:futurePipeline below 60% calls move(FUTURE_PIPELINE)", async () => {
    h.candidateService.move.mockResolvedValue({ status: "FUTURE_PIPELINE" });
    const dto = await screeningService.saveAndMaybeMove(
      "c1",
      { ...LOW_SCORE_INPUT, action: "futurePipeline" },
      user,
    );
    expect(dto.result.decision).toBe("Hold");
    expect(h.candidateService.move).toHaveBeenCalledWith("c1", "FUTURE_PIPELINE", user);
    expect(dto.moved).toEqual({ toStatus: "FUTURE_PIPELINE" });
  });

  it("action:futurePipeline at 60%+ throws BAD_REQUEST and never calls move", async () => {
    await expect(
      screeningService.saveAndMaybeMove(
        "c1",
        { ...HIGH_SCORE_INPUT, action: "futurePipeline" },
        user,
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(h.candidateService.move).not.toHaveBeenCalled();
  });

  it("action:save never calls move, regardless of score", async () => {
    const dto = await screeningService.saveAndMaybeMove(
      "c1",
      { ...HIGH_SCORE_INPUT, action: "save" },
      user,
    );
    expect(h.candidateService.move).not.toHaveBeenCalled();
    expect(dto.moved).toBeNull();
  });

  it("throws NOT_FOUND for a missing candidate and never persists a scorecard", async () => {
    h.candidateRepo.findById.mockResolvedValue(null);
    await expect(
      screeningService.saveAndMaybeMove("missing", { ...LOW_SCORE_INPUT, action: "save" }, user),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(h.screeningRepo.create).not.toHaveBeenCalled();
  });

  it("a STAGE_BLOCKED from move still leaves the scorecard persisted", async () => {
    const { AppError } = await import("@/server/http/app-error");
    h.candidateService.move.mockRejectedValue(
      new AppError("STAGE_BLOCKED", "License must be Active"),
    );
    await expect(
      screeningService.saveAndMaybeMove("c1", { ...HIGH_SCORE_INPUT, action: "advance" }, user),
    ).rejects.toMatchObject({ code: "STAGE_BLOCKED" });
    expect(h.screeningRepo.create).toHaveBeenCalled();
  });
});

describe("screeningService.listEligibleCandidates", () => {
  it("scopes the candidate read to the 3 eligible statuses and resolves client names", async () => {
    h.candidateRepo.list.mockResolvedValue([candidateRow()]);
    h.clientRepo.nameMap.mockResolvedValue(new Map([["cl1", "Sterling Institute"]]));
    const out = await screeningService.listEligibleCandidates(undefined);
    expect(h.candidateRepo.list).toHaveBeenCalledWith(
      expect.objectContaining({
        statuses: ["QUALIFIED_PRESCREEN", "INITIAL_SCREENING", "DESTA_REVIEW"],
      }),
    );
    expect(out[0]).toMatchObject({ id: "c1", name: "Jane Doe", clientName: "Sterling Institute" });
  });
});
