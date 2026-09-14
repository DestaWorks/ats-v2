import type { TenantContext } from "@destaworks/domain/tenant";
import type {
  DailyLog,
  DailyTarget,
  JournalEntry,
  JournalGoal,
  ManagerFeedback,
  Prisma,
} from "../generated/prisma/client";
import { db, type ScopedTx, type SeamWrite, scopedWrite } from "../tenant-scope";
import { CHILD_ROWS_CAP, REFERENCE_ROWS_CAP } from "../query-limits";

export type DailyTargetRow = DailyTarget;
export type DailyLogRow = DailyLog;
export type JournalEntryRow = JournalEntry;
export type JournalGoalRow = JournalGoal;
export type ManagerFeedbackRow = ManagerFeedback;

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
  upsertTarget(
    ctx: TenantContext,
    data: SeamWrite<Prisma.DailyTargetUncheckedCreateInput>,
    tx?: ScopedTx,
  ) {
    const { userId, date, ...rest } = data;
    return db(ctx, tx).dailyTarget.upsert({
      where: { userId_date: { userId, date } },
      create: scopedWrite(data),
      update: rest,
    });
  },
  targetFor(ctx: TenantContext, userId: string, date: string, tx?: ScopedTx) {
    return db(ctx, tx).dailyTarget.findUnique({ where: { userId_date: { userId, date } } });
  },
  targetsForDate(ctx: TenantContext, date: string, tx?: ScopedTx) {
    return db(ctx, tx).dailyTarget.findMany({ where: { date }, take: REFERENCE_ROWS_CAP });
  },
  /** All targets across a set of date keys (Wave 5.2 Trends' "goal" column — sum of a rolling
   *  7-day window's daily targets, ONE query instead of 7 `targetsForDate` calls). */
  targetsForDateRange(ctx: TenantContext, dates: string[], tx?: ScopedTx) {
    if (dates.length === 0) return Promise.resolve([]);
    return db(ctx, tx).dailyTarget.findMany({
      where: { date: { in: dates } },
      take: REFERENCE_ROWS_CAP,
    });
  },

  // --- end-of-shift actuals ---
  upsertActual(
    ctx: TenantContext,
    data: SeamWrite<Prisma.DailyActualUncheckedCreateInput>,
    tx?: ScopedTx,
  ) {
    const { userId, date, ...rest } = data;
    return db(ctx, tx).dailyActual.upsert({
      where: { userId_date: { userId, date } },
      create: scopedWrite(data),
      update: rest,
    });
  },
  actualFor(ctx: TenantContext, userId: string, date: string, tx?: ScopedTx) {
    return db(ctx, tx).dailyActual.findUnique({ where: { userId_date: { userId, date } } });
  },
  actualsForRange(ctx: TenantContext, startDate: string, endDate: string, tx?: ScopedTx) {
    return db(ctx, tx).dailyActual.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      orderBy: [{ date: "asc" }],
      take: REFERENCE_ROWS_CAP,
    });
  },

  // --- daily log (one per user/day; create-only like legacy's submitted state) ---
  createLog(
    ctx: TenantContext,
    data: SeamWrite<Prisma.DailyLogUncheckedCreateInput>,
    tx?: ScopedTx,
  ) {
    return db(ctx, tx).dailyLog.create({ data: scopedWrite(data) });
  },
  logFor(ctx: TenantContext, userId: string, date: string, tx?: ScopedTx) {
    return db(ctx, tx).dailyLog.findUnique({ where: { userId_date: { userId, date } } });
  },
  logsForUser(ctx: TenantContext, userId: string, take: number, tx?: ScopedTx) {
    return db(ctx, tx).dailyLog.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take,
    });
  },
  /** Every self-reported log across ALL users in a date range (inclusive) — the admin team
   *  breakdown's input (Wave 3.1 backlog). Mirrors `actualsForRange`'s shape one level up. */
  logsForDateRange(ctx: TenantContext, startDate: string, endDate: string, tx?: ScopedTx) {
    return db(ctx, tx).dailyLog.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      take: REFERENCE_ROWS_CAP,
    });
  },

  // --- journal ---
  createEntry(
    ctx: TenantContext,
    data: SeamWrite<Prisma.JournalEntryUncheckedCreateInput>,
    tx?: ScopedTx,
  ) {
    return db(ctx, tx).journalEntry.create({ data: scopedWrite(data) });
  },
  entriesForUser(ctx: TenantContext, userId: string, take: number, tx?: ScopedTx) {
    return db(ctx, tx).journalEntry.findMany({
      where: { userId },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take,
    });
  },
  createGoal(
    ctx: TenantContext,
    data: SeamWrite<Prisma.JournalGoalUncheckedCreateInput>,
    tx?: ScopedTx,
  ) {
    return db(ctx, tx).journalGoal.create({ data: scopedWrite(data) });
  },
  goalsForWeek(ctx: TenantContext, userId: string, weekStart: string, tx?: ScopedTx) {
    return db(ctx, tx).journalGoal.findMany({
      where: { userId, weekStart },
      orderBy: { createdAt: "asc" },
      take: CHILD_ROWS_CAP,
    });
  },
  /** Toggle scoped to the owner (`updateMany` — someone else's goal id is a 0-row no-op). */
  async setGoalDone(ctx: TenantContext, id: string, userId: string, done: boolean, tx?: ScopedTx) {
    const { count } = await db(ctx, tx).journalGoal.updateMany({
      where: { id, userId },
      data: { done },
    });
    return count;
  },

  // --- manager feedback (Wave 3.1 backlog, legacy `mgr_feedback`) ---
  createFeedback(
    ctx: TenantContext,
    data: SeamWrite<Prisma.ManagerFeedbackUncheckedCreateInput>,
    tx?: ScopedTx,
  ) {
    return db(ctx, tx).managerFeedback.create({ data: scopedWrite(data) });
  },
  /** Own-record only (callers always pass the session user's own id as `targetUserId`). */
  feedbackForUser(ctx: TenantContext, targetUserId: string, take: number, tx?: ScopedTx) {
    return db(ctx, tx).managerFeedback.findMany({
      where: { targetUserId },
      orderBy: { createdAt: "desc" },
      take,
    });
  },

  // --- live-actuals counting predicates (legacy `liveActuals`, server-side) ---
  /** Leads sourced by the user within the window (live rows only). */
  countLeadsSourced(ctx: TenantContext, userId: string, w: InstantWindow, tx?: ScopedTx) {
    return db(ctx, tx).sourceLead.count({
      where: { createdById: userId, deletedAt: null, createdAt: { gte: w.start, lt: w.end } },
    });
  },
  /** Outreach attempts (lead + candidate) logged by the user within the window. */
  countOutreach(ctx: TenantContext, userId: string, w: InstantWindow, tx?: ScopedTx) {
    return db(ctx, tx).outreachAttempt.count({
      where: { actorId: userId, at: { gte: w.start, lt: w.end } },
    });
  },
  /** "ATS cleanup" = candidate move/update/verify_license audit rows by the user in the window. */
  countCleanup(ctx: TenantContext, userId: string, w: InstantWindow, tx?: ScopedTx) {
    return db(ctx, tx).activityLog.count({
      where: {
        actor: userId,
        entity: "candidate",
        action: { in: CLEANUP_ACTIONS },
        at: { gte: w.start, lt: w.end },
      },
    });
  },
  /** Candidates added by the user in the window (Daily Log auto-capture). */
  countCandidatesAdded(ctx: TenantContext, userId: string, w: InstantWindow, tx?: ScopedTx) {
    return db(ctx, tx).candidate.count({
      where: { createdById: userId, createdAt: { gte: w.start, lt: w.end } },
    });
  },
  /** One audit-action count by the user in the window (moves / notes / verifications). */
  countAuditAction(
    ctx: TenantContext,
    userId: string,
    action: string,
    w: InstantWindow,
    tx?: ScopedTx,
  ) {
    return db(ctx, tx).activityLog.count({
      where: { actor: userId, action, at: { gte: w.start, lt: w.end } },
    });
  },

  // --- Wave 5.1 (Briefs) range aggregation — extends `actualsForRange` per IMPLEMENTATION-PLAN
  // §5.1's own note ("5.1 briefs extend it"). Per-associate grouped counts over an arbitrary
  // instant window (a day or a Monday-anchored week), batched via ONE `groupBy` each rather than
  // looping `countX` per user. ---

  /** Leads sourced per associate (`createdById`) within the window. */
  async sourcedCountsByRange(ctx: TenantContext, w: InstantWindow, tx?: ScopedTx) {
    const rows = await db(ctx, tx).sourceLead.groupBy({
      by: ["createdById"],
      where: {
        deletedAt: null,
        createdById: { not: null },
        createdAt: { gte: w.start, lt: w.end },
      },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.createdById as string, r._count._all]));
  },

  /** Outreach attempts (lead + candidate) per actor within the window. */
  async outreachCountsByRange(ctx: TenantContext, w: InstantWindow, tx?: ScopedTx) {
    const rows = await db(ctx, tx).outreachAttempt.groupBy({
      by: ["actorId"],
      where: { at: { gte: w.start, lt: w.end } },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.actorId, r._count._all]));
  },

  /** Outreach attempts that GOT a response, per actor, within the window (`respondedAt` — legacy's
   *  "Responses" metric, sourced from the same table as `outreachCountsByRange`, not a guess). */
  async responseCountsByRange(ctx: TenantContext, w: InstantWindow, tx?: ScopedTx) {
    const rows = await db(ctx, tx).outreachAttempt.groupBy({
      by: ["actorId"],
      where: { respondedAt: { gte: w.start, lt: w.end } },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.actorId, r._count._all]));
  },

  /** Leads promoted per actor within the window (the audit trail `lead.service.ts::promote` writes
   *  — ONE definition, not legacy's divergent activity-Action-text vs candidate-Tags pair). */
  async promotedCountsByRange(ctx: TenantContext, w: InstantWindow, tx?: ScopedTx) {
    const rows = await db(ctx, tx).activityLog.groupBy({
      by: ["actor"],
      where: { entity: "source_lead", action: "promote", at: { gte: w.start, lt: w.end } },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.actor, r._count._all]));
  },

  // --- "since you closed" recap reads (domain tables — never gated audit payloads) ---
  candidatesAddedSince(ctx: TenantContext, since: Date, tx?: ScopedTx) {
    return db(ctx, tx).candidate.findMany({
      where: { createdAt: { gt: since }, deletedAt: null },
      select: { name: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  },
  stageMovesSince(ctx: TenantContext, since: Date, tx?: ScopedTx) {
    return db(ctx, tx).stageHistory.findMany({
      where: { enteredAt: { gt: since }, fromStatus: { not: null } },
      select: { candidate: { select: { name: true } } },
      orderBy: { enteredAt: "desc" },
      take: 50,
    });
  },
  outreachSince(ctx: TenantContext, since: Date, tx?: ScopedTx) {
    return db(ctx, tx).outreachAttempt.findMany({
      where: { at: { gt: since } },
      select: { actorId: true },
      orderBy: { at: "desc" },
      take: 100,
    });
  },
  countCandidatesAddedSince(ctx: TenantContext, since: Date, tx?: ScopedTx) {
    return db(ctx, tx).candidate.count({ where: { createdAt: { gt: since }, deletedAt: null } });
  },
  countStageMovesSince(ctx: TenantContext, since: Date, tx?: ScopedTx) {
    return db(ctx, tx).stageHistory.count({
      where: { enteredAt: { gt: since }, fromStatus: { not: null } },
    });
  },
  countOutreachSince(ctx: TenantContext, since: Date, tx?: ScopedTx) {
    return db(ctx, tx).outreachAttempt.count({ where: { at: { gt: since } } });
  },
};
