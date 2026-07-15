import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AuthUser } from "@/server/auth/guards";

/**
 * Proves the daily-loop service WITHOUT a DB: target-setting is capability-gated server-side,
 * live actuals count within the user-LOCAL day window, the Daily Log is one-per-day (409) with
 * server-snapshotted autos, and the goal toggle is a real owner-scoped update.
 */

const h = vi.hoisted(() => ({
  fakeTx: { __tx: true },
  user: { id: "u1", email: "u@desta.works", name: "Test User", role: "Associate" as const },
  owner: { id: "o1", email: "o@desta.works", name: "Owner", role: "Owner" as const },
  repo: {
    upsertTarget: vi.fn(),
    targetFor: vi.fn(),
    targetsForDate: vi.fn(),
    upsertActual: vi.fn(),
    actualFor: vi.fn(),
    actualsForRange: vi.fn(),
    createLog: vi.fn(),
    logFor: vi.fn(),
    logsForUser: vi.fn(),
    createEntry: vi.fn(),
    entriesForUser: vi.fn(),
    createGoal: vi.fn(),
    goalsForWeek: vi.fn(),
    setGoalDone: vi.fn(),
    countLeadsSourced: vi.fn(),
    countOutreach: vi.fn(),
    countCleanup: vi.fn(),
    countCandidatesAdded: vi.fn(),
    countAuditAction: vi.fn(),
    candidatesAddedSince: vi.fn(),
    stageMovesSince: vi.fn(),
    outreachSince: vi.fn(),
  },
  clientRepo: { list: vi.fn() },
  userRepo: { namesByIds: vi.fn(), list: vi.fn() },
  prismaUser: { findUnique: vi.fn() },
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/repositories/daily.repository", () => ({ dailyRepository: h.repo }));
vi.mock("@/server/repositories/client.repository", () => ({ clientRepository: h.clientRepo }));
vi.mock("@/server/repositories/user.repository", () => ({ userRepository: h.userRepo }));
vi.mock("@/server/db/prisma", () => ({ prisma: { user: h.prismaUser } }));
vi.mock("@/server/db/audit", () => ({ writeAudit: h.writeAudit }));
vi.mock("@/server/db/with-transaction", () => ({
  withTransaction: (fn: (tx: unknown) => unknown) => fn(h.fakeTx),
}));

import { dailyService } from "./daily.service";

beforeEach(() => {
  for (const fn of Object.values(h.repo)) fn.mockReset();
  h.clientRepo.list.mockReset();
  h.userRepo.namesByIds.mockReset();
  h.userRepo.list.mockReset();
  h.prismaUser.findUnique.mockReset();
  h.writeAudit.mockReset();
  h.clientRepo.list.mockResolvedValue([{ id: "cl1", name: "Acme Health" }]);
  h.userRepo.namesByIds.mockResolvedValue(new Map());
  h.userRepo.list.mockResolvedValue([{ id: "u1", name: "Test User" }]);
  h.repo.countLeadsSourced.mockResolvedValue(0);
  h.repo.countOutreach.mockResolvedValue(0);
  h.repo.countCleanup.mockResolvedValue(0);
  h.repo.countCandidatesAdded.mockResolvedValue(0);
  h.repo.countAuditAction.mockResolvedValue(0);
  h.repo.targetFor.mockResolvedValue(null);
  h.repo.actualFor.mockResolvedValue(null);
  h.repo.logFor.mockResolvedValue(null);
  h.repo.logsForUser.mockResolvedValue([]);
  h.repo.entriesForUser.mockResolvedValue([]);
  h.repo.goalsForWeek.mockResolvedValue([]);
  h.prismaUser.findUnique.mockResolvedValue({ createdAt: new Date("2026-07-01T00:00:00Z") });
});

describe("dailyService.liveActuals", () => {
  it("counts within the user-LOCAL day window (tz honored)", async () => {
    h.repo.countLeadsSourced.mockResolvedValue(7);
    h.repo.countOutreach.mockResolvedValue(12);
    h.repo.countCleanup.mockResolvedValue(3);

    const out = await dailyService.liveActuals("u1", "2026-07-13", -180); // UTC+3

    expect(out).toEqual({ sourcing: 7, outreach: 12, atsCleanup: 3 });
    const [, w] = h.repo.countLeadsSourced.mock.calls[0]!;
    expect(w.start.toISOString()).toBe("2026-07-12T21:00:00.000Z"); // local midnight in UTC
    expect(w.end.toISOString()).toBe("2026-07-13T21:00:00.000Z");
  });
});

describe("dailyService.setTarget", () => {
  const input = {
    userId: "u1",
    date: "2026-07-13",
    sourcing: 25,
    outreach: 25,
    atsCleanup: 5,
    inbound: 0,
    screens: 0,
  };

  it("FORBIDDEN for a non-leadership caller (server-side gate, no writes)", async () => {
    await expect(dailyService.setTarget(input, h.user as AuthUser)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(h.repo.upsertTarget).not.toHaveBeenCalled();
  });

  it("leadership upserts keyed (userId, date) + audits, with setById from the session", async () => {
    h.userRepo.namesByIds.mockResolvedValue(new Map([["u1", "Test User"]]));
    h.repo.upsertTarget.mockResolvedValue({ id: "t1" });

    await dailyService.setTarget(input, h.owner as AuthUser);

    const [data, tx] = h.repo.upsertTarget.mock.calls[0]!;
    expect(tx).toBe(h.fakeTx);
    expect(data).toMatchObject({ userId: "u1", date: "2026-07-13", sourcing: 25, setById: "o1" });
    expect(h.writeAudit.mock.calls[0]![1]).toMatchObject({
      entity: "daily_target",
      action: "set_targets",
      actor: "o1",
    });
  });

  it("unknown associate → NOT_FOUND", async () => {
    h.userRepo.namesByIds.mockResolvedValue(new Map());
    await expect(
      dailyService.setTarget({ ...input, userId: "ghost" }, h.owner as AuthUser),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("dailyService.submitLog", () => {
  const input = {
    date: "2026-07-13",
    tz: 0,
    sourced: 18,
    outreach: 10,
    responses: 2,
    screenings: 1,
    submitted: 0,
    perClient: { cl1: 3 },
  };

  it("snapshots the auto counts server-side and audits in one tx", async () => {
    h.repo.countCandidatesAdded.mockResolvedValue(4);
    h.repo.countAuditAction.mockImplementation((_u: string, action: string) =>
      Promise.resolve(action === "move" ? 6 : 2),
    );
    h.repo.createLog.mockImplementation((data: Record<string, unknown>) =>
      Promise.resolve({ ...data, id: "dl1", blocker: null, notes: null, shiftHandoff: null }),
    );

    const dto = await dailyService.submitLog(input, h.user as AuthUser);

    const [data, tx] = h.repo.createLog.mock.calls[0]!;
    expect(tx).toBe(h.fakeTx);
    expect(data).toMatchObject({
      userId: "u1",
      autoAdded: 4,
      autoMoved: 6,
      autoNotes: 2,
      perClient: { cl1: 3 },
    });
    expect(dto.sourced).toBe(18);
    expect(h.writeAudit.mock.calls[0]![1]).toMatchObject({ action: "submit_log" });
  });

  it("a second submit for the same day → CONFLICT (no writes)", async () => {
    h.repo.logFor.mockResolvedValue({ id: "dl1" });
    await expect(dailyService.submitLog(input, h.user as AuthUser)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(h.repo.createLog).not.toHaveBeenCalled();
  });
});

describe("dailyService.logView", () => {
  it("computes the tenure ramp from the USER's start date and the streak from history", async () => {
    // Started 2026-07-01 → 2026-07-13 is tenure week 2 → Training Phase (sourced target 15).
    h.repo.logsForUser.mockResolvedValue([
      { date: "2026-07-12", sourced: 20, outreach: 0, responses: 0, screenings: 0, submitted: 0 },
      { date: "2026-07-11", sourced: 15, outreach: 0, responses: 0, screenings: 0, submitted: 0 },
      { date: "2026-07-10", sourced: 2, outreach: 0, responses: 0, screenings: 0, submitted: 0 },
    ]);

    const view = await dailyService.logView(h.user as AuthUser, "2026-07-13", 0);

    expect(view.ramp).toMatchObject({ weekNum: 2, sourced: 15 });
    expect(view.streak).toBe(2); // 12th + 11th hit, 10th missed
    expect(h.repo.goalsForWeek).toHaveBeenCalledWith("u1", "2026-07-13"); // Monday of that week
  });
});

describe("dailyService.setGoalDone", () => {
  it("owner-scoped real update; someone else's goal → NOT_FOUND", async () => {
    h.repo.setGoalDone.mockResolvedValue(1);
    await dailyService.setGoalDone("g1", true, h.user as AuthUser);
    expect(h.repo.setGoalDone).toHaveBeenCalledWith("g1", "u1", true);

    h.repo.setGoalDone.mockResolvedValue(0);
    await expect(
      dailyService.setGoalDone("not-mine", true, h.user as AuthUser),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("dailyService.recap", () => {
  it("buckets counts + capped names from domain reads", async () => {
    h.repo.candidatesAddedSince.mockResolvedValue([
      { name: "A" },
      { name: "B" },
      { name: "C" },
      { name: "D" },
    ]);
    h.repo.stageMovesSince.mockResolvedValue([{ candidate: { name: "Jane" } }]);
    h.repo.outreachSince.mockResolvedValue([{ actorId: "u1" }, { actorId: "u1" }]);
    h.userRepo.namesByIds.mockResolvedValue(new Map([["u1", "Test User"]]));

    const recap = await dailyService.recap(new Date("2026-07-12T00:00:00Z"));

    expect(recap.added).toEqual({ count: 4, names: ["A", "B", "C"] });
    expect(recap.moves).toEqual({ count: 1, names: ["Jane"] });
    expect(recap.outreach).toEqual({ count: 2, actors: ["Test User"] }); // distinct actors
  });
});
