import "server-only";
import type {
  DailyActual,
  DailyLog,
  DailyTarget,
  JournalEntry,
  JournalGoal,
  Prisma,
} from "@/generated/prisma/client";
import { db } from "@/server/db/prisma";

export type DailyTargetRow = DailyTarget;
export type DailyActualRow = DailyActual;
export type DailyLogRow = DailyLog;
export type JournalEntryRow = JournalEntry;
export type JournalGoalRow = JournalGoal;

/** A UTC instant window `[start, end)` (one user-local day, resolved by `lib/daily.dayWindow`). */
export interface InstantWindow {
  start: Date;
  end: Date;
}

/** Audit actions that count as "ATS cleanup" (legacy: verify license / update / move). */
const CLEANUP_ACTIONS = ["move", "update", "verify_license"];

/**
 * Daily-loop data access — targets/actuals/logs/journal CRUD plus the COUNTING predicates the
 * live-actuals service uses (all `count()`s over indexed columns; never loads rows to count).
 */
export const dailyRepository = {
  // --- targets ---
  upsertTarget(data: Prisma.DailyTargetUncheckedCreateInput, tx?: Prisma.TransactionClient) {
    const { userId, date, ...rest } = data;
    return db(tx).dailyTarget.upsert({
      where: { userId_date: { userId, date } },
      create: data,
      update: rest,
    });
  },
  targetFor(userId: string, date: string, tx?: Prisma.TransactionClient) {
    return db(tx).dailyTarget.findUnique({ where: { userId_date: { userId, date } } });
  },
  targetsForDate(date: string, tx?: Prisma.TransactionClient) {
    return db(tx).dailyTarget.findMany({ where: { date } });
  },

  // --- end-of-shift actuals ---
  upsertActual(data: Prisma.DailyActualUncheckedCreateInput, tx?: Prisma.TransactionClient) {
    const { userId, date, ...rest } = data;
    return db(tx).dailyActual.upsert({
      where: { userId_date: { userId, date } },
      create: data,
      update: rest,
    });
  },
  actualFor(userId: string, date: string, tx?: Prisma.TransactionClient) {
    return db(tx).dailyActual.findUnique({ where: { userId_date: { userId, date } } });
  },
  actualsForRange(startDate: string, endDate: string, tx?: Prisma.TransactionClient) {
    return db(tx).dailyActual.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      orderBy: [{ date: "asc" }],
    });
  },

  // --- daily log (one per user/day; create-only like legacy's submitted state) ---
  createLog(data: Prisma.DailyLogUncheckedCreateInput, tx?: Prisma.TransactionClient) {
    return db(tx).dailyLog.create({ data });
  },
  logFor(userId: string, date: string, tx?: Prisma.TransactionClient) {
    return db(tx).dailyLog.findUnique({ where: { userId_date: { userId, date } } });
  },
  logsForUser(userId: string, take: number, tx?: Prisma.TransactionClient) {
    return db(tx).dailyLog.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take,
    });
  },

  // --- journal ---
  createEntry(data: Prisma.JournalEntryUncheckedCreateInput, tx?: Prisma.TransactionClient) {
    return db(tx).journalEntry.create({ data });
  },
  entriesForUser(userId: string, take: number, tx?: Prisma.TransactionClient) {
    return db(tx).journalEntry.findMany({
      where: { userId },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take,
    });
  },
  createGoal(data: Prisma.JournalGoalUncheckedCreateInput, tx?: Prisma.TransactionClient) {
    return db(tx).journalGoal.create({ data });
  },
  goalsForWeek(userId: string, weekStart: string, tx?: Prisma.TransactionClient) {
    return db(tx).journalGoal.findMany({
      where: { userId, weekStart },
      orderBy: { createdAt: "asc" },
    });
  },
  /** Toggle scoped to the owner (`updateMany` — someone else's goal id is a 0-row no-op). */
  async setGoalDone(id: string, userId: string, done: boolean, tx?: Prisma.TransactionClient) {
    const { count } = await db(tx).journalGoal.updateMany({
      where: { id, userId },
      data: { done },
    });
    return count;
  },

  // --- live-actuals counting predicates (legacy `liveActuals`, server-side) ---
  /** Leads sourced by the user within the window (live rows only). */
  countLeadsSourced(userId: string, w: InstantWindow, tx?: Prisma.TransactionClient) {
    return db(tx).sourceLead.count({
      where: { createdById: userId, deletedAt: null, createdAt: { gte: w.start, lt: w.end } },
    });
  },
  /** Outreach attempts (lead + candidate) logged by the user within the window. */
  countOutreach(userId: string, w: InstantWindow, tx?: Prisma.TransactionClient) {
    return db(tx).outreachAttempt.count({
      where: { actorId: userId, at: { gte: w.start, lt: w.end } },
    });
  },
  /** "ATS cleanup" = candidate move/update/verify_license audit rows by the user in the window. */
  countCleanup(userId: string, w: InstantWindow, tx?: Prisma.TransactionClient) {
    return db(tx).activityLog.count({
      where: {
        actor: userId,
        entity: "candidate",
        action: { in: CLEANUP_ACTIONS },
        at: { gte: w.start, lt: w.end },
      },
    });
  },
  /** Candidates added by the user in the window (Daily Log auto-capture). */
  countCandidatesAdded(userId: string, w: InstantWindow, tx?: Prisma.TransactionClient) {
    return db(tx).candidate.count({
      where: { createdById: userId, createdAt: { gte: w.start, lt: w.end } },
    });
  },
  /** One audit-action count by the user in the window (moves / notes / verifications). */
  countAuditAction(
    userId: string,
    action: string,
    w: InstantWindow,
    tx?: Prisma.TransactionClient,
  ) {
    return db(tx).activityLog.count({
      where: { actor: userId, action, at: { gte: w.start, lt: w.end } },
    });
  },

  // --- "since you closed" recap reads (domain tables — never gated audit payloads) ---
  candidatesAddedSince(since: Date, tx?: Prisma.TransactionClient) {
    return db(tx).candidate.findMany({
      where: { createdAt: { gt: since }, deletedAt: null },
      select: { name: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  },
  stageMovesSince(since: Date, tx?: Prisma.TransactionClient) {
    return db(tx).stageHistory.findMany({
      where: { enteredAt: { gt: since }, fromStatus: { not: null } },
      select: { candidate: { select: { name: true } } },
      orderBy: { enteredAt: "desc" },
      take: 50,
    });
  },
  outreachSince(since: Date, tx?: Prisma.TransactionClient) {
    return db(tx).outreachAttempt.findMany({
      where: { at: { gt: since } },
      select: { actorId: true },
      orderBy: { at: "desc" },
      take: 100,
    });
  },
};
