import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AuthUser } from "@/server/auth/guards";

/**
 * Proves the candidate service's transition rules WITHOUT a DB: the stage gate is
 * server-authoritative (a failing gate → STAGE_BLOCKED, no writes), and an allowed `move`
 * writes the candidate update + a stage-history row + an audit row atomically (same `tx`). We
 * mock the repositories, `writeAudit`, `withTransaction` (runs the callback with a fake `tx`),
 * and `requireUser`; the pure rules (`checkStageGate`) run for real.
 */

const h = vi.hoisted(() => ({
  fakeTx: { __tx: true },
  user: { id: "u1", email: "u@desta.works", name: "Test User", role: "Associate" as const },
  candidateRepo: {
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
  },
  stageRepo: { add: vi.fn() },
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/guards", () => ({ requireUser: async () => h.user }));
vi.mock("@/server/repositories/candidate.repository", () => ({
  candidateRepository: h.candidateRepo,
}));
vi.mock("@/server/repositories/stage-history.repository", () => ({
  stageHistoryRepository: h.stageRepo,
}));
vi.mock("@/server/db/audit", () => ({ writeAudit: h.writeAudit }));
vi.mock("@/server/db/with-transaction", () => ({
  withTransaction: (fn: (tx: unknown) => unknown) => fn(h.fakeTx),
}));

import { candidateService } from "./candidate.service";

/** A candidate row with the fields the service + rules read. */
function candidate(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    status: "NEW_CANDIDATE",
    stageOrder: 0,
    track: "Clinical",
    credential: "PMHNP",
    licenseState: "NJ",
    licenseStatus: "Active",
    population: "Adult",
    setting: "Telehealth",
    clientId: "cl1",
    email: "jane@example.com",
    phone: "555-0100",
    placedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  h.candidateRepo.findById.mockReset();
  h.candidateRepo.update.mockReset();
  h.candidateRepo.softDelete.mockReset();
  h.stageRepo.add.mockReset();
  h.writeAudit.mockReset();
});

describe("candidateService.move", () => {
  it("throws NOT_FOUND when the candidate does not exist", async () => {
    h.candidateRepo.findById.mockResolvedValue(null);
    await expect(
      candidateService.move("missing", "CLIENT_INTERVIEW", h.user as AuthUser),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(h.candidateRepo.update).not.toHaveBeenCalled();
  });

  it("blocks on a failing stage gate with STAGE_BLOCKED and writes nothing", async () => {
    // Clinical candidate missing credential + license state → QUALIFIED_PRESCREEN is gated.
    h.candidateRepo.findById.mockResolvedValue(candidate({ credential: null, licenseState: null }));

    await expect(
      candidateService.move("c1", "QUALIFIED_PRESCREEN", h.user as AuthUser),
    ).rejects.toMatchObject({ code: "STAGE_BLOCKED" });

    expect(h.candidateRepo.update).not.toHaveBeenCalled();
    expect(h.stageRepo.add).not.toHaveBeenCalled();
    expect(h.writeAudit).not.toHaveBeenCalled();
  });

  it("on an allowed move, writes the update + stage-history + audit in one transaction", async () => {
    h.candidateRepo.findById.mockResolvedValue(candidate());
    h.candidateRepo.update.mockResolvedValue({ id: "c1", status: "CLIENT_INTERVIEW" });

    await candidateService.move("c1", "CLIENT_INTERVIEW", h.user as AuthUser);

    // candidate update — denormalized pipeline columns, using the shared tx
    expect(h.candidateRepo.update).toHaveBeenCalledTimes(1);
    const [uid, data, utx] = h.candidateRepo.update.mock.calls[0]!;
    expect(uid).toBe("c1");
    expect(utx).toBe(h.fakeTx);
    expect(data).toMatchObject({ status: "CLIENT_INTERVIEW", stageOrder: 5 });
    expect(data.stageEnteredAt).toBeInstanceOf(Date);
    expect(data.placedAt).toBeNull(); // not STARTED_DAY1

    // stage-history row, same tx
    expect(h.stageRepo.add).toHaveBeenCalledTimes(1);
    const [histInput, htx] = h.stageRepo.add.mock.calls[0]!;
    expect(htx).toBe(h.fakeTx);
    expect(histInput).toMatchObject({
      candidateId: "c1",
      fromStatus: "NEW_CANDIDATE",
      toStatus: "CLIENT_INTERVIEW",
      fromStageOrder: 0,
      toStageOrder: 5,
      actorId: "u1",
    });

    // audit row, same tx, actor = the moving user
    expect(h.writeAudit).toHaveBeenCalledTimes(1);
    const [atx, auditParams] = h.writeAudit.mock.calls[0]!;
    expect(atx).toBe(h.fakeTx);
    expect(auditParams).toMatchObject({
      entity: "candidate",
      entityId: "c1",
      actor: "u1",
      action: "move",
    });
  });

  it("sets placedAt once when reaching STARTED_DAY1", async () => {
    h.candidateRepo.findById.mockResolvedValue(
      candidate({ status: "OFFER_ACCEPTED", stageOrder: 7 }),
    );
    h.candidateRepo.update.mockResolvedValue({ id: "c1" });

    await candidateService.move("c1", "STARTED_DAY1", h.user as AuthUser);

    const [, data] = h.candidateRepo.update.mock.calls[0]!;
    expect(data.placedAt).toBeInstanceOf(Date);
    expect(data.stageOrder).toBe(8);
  });

  it("preserves the original placedAt when re-entering STARTED_DAY1 (set-once)", async () => {
    const originalPlacedAt = new Date("2026-01-15T00:00:00.000Z");
    h.candidateRepo.findById.mockResolvedValue(
      // Already placed, then bounced back to OFFER_ACCEPTED, now returning to STARTED_DAY1.
      candidate({ status: "OFFER_ACCEPTED", stageOrder: 7, placedAt: originalPlacedAt }),
    );
    h.candidateRepo.update.mockResolvedValue({ id: "c1" });

    await candidateService.move("c1", "STARTED_DAY1", h.user as AuthUser);

    const [, data] = h.candidateRepo.update.mock.calls[0]!;
    expect(data.placedAt).toBe(originalPlacedAt); // NOT overwritten with now()
  });

  it("rejects an unknown pipeline status with BAD_REQUEST before any write", async () => {
    h.candidateRepo.findById.mockResolvedValue(candidate());
    await expect(
      // @ts-expect-error — exercising the runtime guard at a route-like boundary
      candidateService.move("c1", "NOT_A_REAL_STATUS", h.user as AuthUser),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(h.candidateRepo.update).not.toHaveBeenCalled();
  });
});

describe("candidateService.bulkMove", () => {
  it("is partial-success: valid ids move, blocked ids are reported, NONE bypass the gate", async () => {
    // "ok" is a complete Clinical candidate; "bad" is missing credential + license state, so
    // QUALIFIED_PRESCREEN is gated for it. Both ids are attempted against the same gate.
    h.candidateRepo.findById.mockImplementation(async (id: string) =>
      id === "ok"
        ? candidate({ id: "ok" })
        : candidate({ id: "bad", credential: null, licenseState: null }),
    );
    h.candidateRepo.update.mockResolvedValue({ id: "ok", status: "QUALIFIED_PRESCREEN" });

    const result = await candidateService.bulkMove(
      ["ok", "bad"],
      "QUALIFIED_PRESCREEN",
      h.user as AuthUser,
    );

    expect(result.moved).toEqual(["ok"]);
    expect(result.blocked).toEqual([
      { id: "bad", reason: "Credential required; License state required" },
    ]);
    // Every id ran the gate (findById for both); only the allowed one wrote (no bypass, per-txn).
    expect(h.candidateRepo.findById).toHaveBeenCalledWith("ok");
    expect(h.candidateRepo.findById).toHaveBeenCalledWith("bad");
    expect(h.candidateRepo.update).toHaveBeenCalledTimes(1);
    const [uid] = h.candidateRepo.update.mock.calls[0]!;
    expect(uid).toBe("ok");
  });

  it("collects a not-found id in `blocked` instead of throwing", async () => {
    h.candidateRepo.findById.mockImplementation(async (id: string) =>
      id === "missing" ? null : candidate({ id }),
    );
    h.candidateRepo.update.mockResolvedValue({ id: "c1" });

    const result = await candidateService.bulkMove(
      ["missing", "c1"],
      "CLIENT_INTERVIEW",
      h.user as AuthUser,
    );

    expect(result.moved).toEqual(["c1"]);
    expect(result.blocked).toEqual([{ id: "missing", reason: "Candidate not found" }]);
  });
});

describe("candidateService.softDelete", () => {
  it("sets deletedAt + deletedById via the repository", async () => {
    h.candidateRepo.findById.mockResolvedValue(candidate());
    h.candidateRepo.softDelete.mockResolvedValue({ id: "c1", deletedAt: new Date() });

    await candidateService.softDelete("c1");

    expect(h.candidateRepo.softDelete).toHaveBeenCalledWith("c1", "u1");
  });

  it("throws NOT_FOUND when the candidate does not exist", async () => {
    h.candidateRepo.findById.mockResolvedValue(null);
    await expect(candidateService.softDelete("missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(h.candidateRepo.softDelete).not.toHaveBeenCalled();
  });
});
