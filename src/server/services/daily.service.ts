import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { hasCapability } from "@/lib/constants";
import {
  businessDaysLeft,
  daysAfter,
  dayWindow,
  mondayOf,
  rampFor,
  sourcingStreak,
  tenureWeek,
  weeklyPacing,
} from "@/lib/daily";
import type {
  AddFeedbackInput,
  DailyLogDTO,
  DailyLogViewDTO,
  DailyOverviewDTO,
  DailyTargetDTO,
  JournalEntryDTO,
  JournalGoalDTO,
  LiveActualsDTO,
  ManagerFeedbackDTO,
  RecapDTO,
  SaveActualsInput,
  SetTargetInput,
  SubmitLogInput,
  TeamBreakdownDTO,
} from "@/lib/validation/daily";
import { toIso } from "@/lib/utils/iso";
import type { AuthUser } from "@/server/auth/guards";
import { writeAudit } from "@/server/db/audit";
import { withTransaction } from "@/server/db/with-transaction";
import {
  dailyRepository,
  type DailyLogRow,
  type DailyTargetRow,
  type JournalEntryRow,
  type JournalGoalRow,
  type ManagerFeedbackRow,
} from "@/server/repositories/daily.repository";
import { clientRepository } from "@/server/repositories/client.repository";
import { userRepository } from "@/server/repositories/user.repository";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/http/app-error";

/** The capability that gates target-setting (leadership; legacy: the Daily Brief manager modal). */
const SET_TARGETS_CAP = "viewReports" as const;

/** Legacy Daily Log excluded these 2 non-recruiting placeholder clients from the per-client
 *  sourcing breakdown (not real targets); the EOS modal did NOT apply this exclusion — both
 *  intentional, legacy parity (legacy/index.html:2319 vs :1240). */
const PER_CLIENT_BREAKDOWN_EXCLUDED = new Set(["NJ-Psych Candidates", "Future Potential Clients"]);

function toTargetDTO(
  row: DailyTargetRow,
  clientNames: Map<string, string>,
  userNames: Map<string, string>,
): DailyTargetDTO {
  return {
    userId: row.userId,
    date: row.date,
    sourcing: row.sourcing,
    outreach: row.outreach,
    atsCleanup: row.atsCleanup,
    inbound: row.inbound,
    screens: row.screens,
    priorityClientName: row.priorityClientId
      ? (clientNames.get(row.priorityClientId) ?? null)
      : null,
    priorityRole: row.priorityRole,
    priorityState: row.priorityState,
    notesFromYesterday: row.notesFromYesterday,
    watchFor: row.watchFor,
    setByName: userNames.get(row.setById) ?? null,
  };
}

function toLogDTO(row: DailyLogRow): DailyLogDTO {
  return {
    date: row.date,
    sourced: row.sourced,
    outreach: row.outreach,
    responses: row.responses,
    screenings: row.screenings,
    submitted: row.submitted,
    blocker: row.blocker,
    notes: row.notes,
    shiftHandoff: row.shiftHandoff,
    autoAdded: row.autoAdded,
    autoMoved: row.autoMoved,
    autoNotes: row.autoNotes,
  };
}

function toEntryDTO(row: JournalEntryRow): JournalEntryDTO {
  return { id: row.id, date: row.date, text: row.text, createdAt: toIso(row.createdAt) };
}

function toGoalDTO(row: JournalGoalRow): JournalGoalDTO {
  return { id: row.id, weekStart: row.weekStart, text: row.text, done: row.done };
}

function toFeedbackDTO(row: ManagerFeedbackRow): ManagerFeedbackDTO {
  return { authorName: row.authorName, body: row.body, createdAt: toIso(row.createdAt) };
}

/**
 * Daily accountability loop (Wave 3.1). ONE source of truth for "what counts today": live
 * actuals are event-derived server-side (leads sourced / outreach attempts / cleanup audit
 * rows within the USER-LOCAL day window), targets and end-of-shift actuals key on real user
 * ids (legacy synthesized emails), and every week is Monday-anchored via `lib/daily`.
 */
export const dailyService = {
  /** Event-derived counts for one user-local day (legacy `liveActuals`; inbound/screens have none). */
  async liveActuals(userId: string, date: string, tz: number): Promise<LiveActualsDTO> {
    const w = dayWindow(date, tz);
    const [sourcing, outreach, atsCleanup] = await Promise.all([
      dailyRepository.countLeadsSourced(userId, w),
      dailyRepository.countOutreach(userId, w),
      dailyRepository.countCleanup(userId, w),
    ]);
    return { sourcing, outreach, atsCleanup };
  },

  /** The Overview strip composite for the SESSION user. */
  async overview(user: AuthUser, date: string, tz: number): Promise<DailyOverviewDTO> {
    const canSetTargets = hasCapability(user.role, SET_TARGETS_CAP);
    const [target, live, actual, clients, teammates] = await Promise.all([
      dailyRepository.targetFor(user.id, date),
      this.liveActuals(user.id, date, tz),
      dailyRepository.actualFor(user.id, date),
      clientRepository.list(),
      canSetTargets ? userRepository.list() : Promise.resolve(undefined),
    ]);
    const clientNames = new Map(clients.map((c) => [c.id, c.name]));
    const userNames = target
      ? await userRepository.namesByIds([target.setById])
      : new Map<string, string>();
    return {
      target: target ? toTargetDTO(target, clientNames, userNames) : null,
      live,
      actualSubmitted: actual !== null,
      canSetTargets,
      teammates,
      clients: clients.map((c) => ({ id: c.id, name: c.name })),
    };
  },

  /** Set/replace one associate's targets for a day — LEADERSHIP only (audited). */
  async setTarget(input: SetTargetInput, user: AuthUser): Promise<void> {
    if (!hasCapability(user.role, SET_TARGETS_CAP)) {
      throw new AppError("FORBIDDEN", "Only leadership can set targets");
    }
    const names = await userRepository.namesByIds([input.userId]);
    if (!names.has(input.userId)) throw new AppError("NOT_FOUND", "User not found");
    await withTransaction(async (tx) => {
      const row = await dailyRepository.upsertTarget(
        {
          userId: input.userId,
          date: input.date,
          sourcing: input.sourcing,
          outreach: input.outreach,
          atsCleanup: input.atsCleanup,
          inbound: input.inbound,
          screens: input.screens,
          priorityClientId: input.priorityClientId ?? null,
          priorityRole: input.priorityRole ?? null,
          priorityState: input.priorityState ?? null,
          notesFromYesterday: input.notesFromYesterday ?? null,
          watchFor: input.watchFor ?? null,
          setById: user.id,
        },
        tx,
      );
      await writeAudit(tx, {
        entity: "daily_target",
        entityId: row.id,
        actor: user.id,
        action: "set_targets",
        after: { userId: input.userId, date: input.date, sourcing: input.sourcing },
      });
    });
  },

  /** End of Shift — upsert the SESSION user's confirmed actuals for the day (audited). */
  async saveActuals(input: SaveActualsInput, user: AuthUser): Promise<void> {
    await withTransaction(async (tx) => {
      const row = await dailyRepository.upsertActual(
        {
          userId: user.id,
          date: input.date,
          sourcing: input.sourcing,
          outreach: input.outreach,
          atsCleanup: input.atsCleanup,
          inbound: input.inbound,
          screens: input.screens,
          note: input.note ?? null,
          shiftHandoff: input.shiftHandoff ?? null,
          perClientSourcing: (input.perClientSourcing ?? {}) as Prisma.InputJsonValue,
        },
        tx,
      );
      await writeAudit(tx, {
        entity: "daily_actual",
        entityId: row.id,
        actor: user.id,
        action: "save_actuals",
        after: { date: input.date, sourcing: input.sourcing, outreach: input.outreach },
      });
    });
  },

  /** "Since you closed" recap — counts + a few names, from DOMAIN tables (never gated audit). */
  async recap(since: Date): Promise<RecapDTO> {
    const [added, moves, outreach] = await Promise.all([
      dailyRepository.candidatesAddedSince(since),
      dailyRepository.stageMovesSince(since),
      dailyRepository.outreachSince(since),
    ]);
    const actorNames = await userRepository.namesByIds(outreach.map((o) => o.actorId));
    const distinctActors = [...new Set(outreach.map((o) => actorNames.get(o.actorId) ?? "—"))];
    return {
      added: { count: added.length, names: added.slice(0, 3).map((c) => c.name) },
      moves: { count: moves.length, names: moves.slice(0, 3).map((m) => m.candidate.name) },
      outreach: { count: outreach.length, actors: distinctActors.slice(0, 3) },
    };
  },

  /** The Daily Log page composite for the SESSION user. */
  async logView(user: AuthUser, date: string, tz: number): Promise<DailyLogViewDTO> {
    const w = dayWindow(date, tz);
    const [log, added, moved, notes, verified, history, entries, userRow, clients, feedback] =
      await Promise.all([
        dailyRepository.logFor(user.id, date),
        dailyRepository.countCandidatesAdded(user.id, w),
        dailyRepository.countAuditAction(user.id, "move", w),
        dailyRepository.countAuditAction(user.id, "add_note", w),
        dailyRepository.countAuditAction(user.id, "verify_license", w),
        dailyRepository.logsForUser(user.id, 15),
        dailyRepository.entriesForUser(user.id, 20),
        prisma.user.findUnique({ where: { id: user.id }, select: { createdAt: true } }),
        clientRepository.list(),
        dailyRepository.feedbackForUser(user.id, 2),
      ]);
    const goals = await dailyRepository.goalsForWeek(user.id, mondayOf(date));
    const weekNum = tenureWeek(userRow?.createdAt ?? new Date(), date);
    const ramp = rampFor(weekNum);
    const logsByDate = new Map(history.map((l) => [l.date, l.sourced]));

    // "Predictive pacing" (Wave 3.1 backlog, legacy Daily Log): the rolling Monday-anchored
    // week's self-reported sourcing so far vs. the daily ramp target.
    const monday = mondayOf(date);
    const weekLogs = history.filter((l) => l.date >= monday && l.date <= date);
    const weekTotals = {
      sourced: weekLogs.reduce((sum, l) => sum + l.sourced, 0),
      days: weekLogs.length,
    };
    const pacing = weeklyPacing(
      weekTotals.sourced,
      ramp.sourced,
      weekTotals.days,
      businessDaysLeft(date),
    );

    return {
      log: log ? toLogDTO(log) : null,
      auto: { added, moved, notes, verified },
      ramp: { ...ramp, weekNum },
      streak: sourcingStreak(date, logsByDate, ramp.sourced),
      history: history.slice(0, 10).map(toLogDTO),
      goals: goals.map(toGoalDTO),
      entries: entries.map(toEntryDTO),
      clients: clients
        .filter((c) => !PER_CLIENT_BREAKDOWN_EXCLUDED.has(c.name))
        .map((c) => ({ id: c.id, name: c.name })),
      weekTotals,
      pacing,
      feedback: feedback.map(toFeedbackDTO),
    };
  },

  /** Submit the day's self-report (ONE per user/day — a resubmit is a 409; autos snapshot here). */
  async submitLog(input: SubmitLogInput, user: AuthUser): Promise<DailyLogDTO> {
    const existing = await dailyRepository.logFor(user.id, input.date);
    if (existing) throw new AppError("CONFLICT", "Today's log is already submitted");
    const w = dayWindow(input.date, input.tz);
    const [added, moved, notes] = await Promise.all([
      dailyRepository.countCandidatesAdded(user.id, w),
      dailyRepository.countAuditAction(user.id, "move", w),
      dailyRepository.countAuditAction(user.id, "add_note", w),
    ]);
    const row = await withTransaction(async (tx) => {
      const created = await dailyRepository.createLog(
        {
          userId: user.id,
          date: input.date,
          sourced: input.sourced,
          outreach: input.outreach,
          responses: input.responses,
          screenings: input.screenings,
          submitted: input.submitted,
          blocker: input.blocker ?? null,
          notes: input.notes ?? null,
          shiftHandoff: input.shiftHandoff ?? null,
          perClient: (input.perClient ?? {}) as Prisma.InputJsonValue,
          autoAdded: added,
          autoMoved: moved,
          autoNotes: notes,
        },
        tx,
      );
      await writeAudit(tx, {
        entity: "daily_log",
        entityId: created.id,
        actor: user.id,
        action: "submit_log",
        after: { date: input.date, sourced: input.sourced },
      });
      return created;
    });
    return toLogDTO(row);
  },

  /** Add a journal note (personal; audited lightly). */
  async addEntry(date: string, text: string, user: AuthUser): Promise<JournalEntryDTO> {
    const row = await withTransaction(async (tx) => {
      const created = await dailyRepository.createEntry({ userId: user.id, date, text }, tx);
      await writeAudit(tx, {
        entity: "journal",
        entityId: created.id,
        actor: user.id,
        action: "journal_entry",
        after: { date },
      });
      return created;
    });
    return toEntryDTO(row);
  },

  /** Add a weekly goal (weekStart is normalized to the Monday of its week). */
  async addGoal(weekStart: string, text: string, user: AuthUser): Promise<JournalGoalDTO> {
    const monday = mondayOf(weekStart);
    const row = await withTransaction(async (tx) => {
      const created = await dailyRepository.createGoal(
        { userId: user.id, weekStart: monday, text },
        tx,
      );
      await writeAudit(tx, {
        entity: "journal",
        entityId: created.id,
        actor: user.id,
        action: "journal_goal",
        after: { weekStart: monday },
      });
      return created;
    });
    return toGoalDTO(row);
  },

  /** Toggle a goal done/undone — a REAL update (the legacy append-duplicate bug stops here). */
  async setGoalDone(id: string, done: boolean, user: AuthUser): Promise<void> {
    const count = await dailyRepository.setGoalDone(id, user.id, done);
    if (count === 0) throw new AppError("NOT_FOUND", "Goal not found");
  },

  /**
   * Manager → associate feedback note (Wave 3.1 backlog, legacy `mgr_feedback`) — LEADERSHIP
   * only, same tier as `setTarget` (never Owner/Admin-only `manageUsers`). Audited.
   */
  async addFeedback(input: AddFeedbackInput, user: AuthUser): Promise<void> {
    if (!hasCapability(user.role, SET_TARGETS_CAP)) {
      throw new AppError("FORBIDDEN", "Only leadership can post feedback");
    }
    const names = await userRepository.namesByIds([input.userId]);
    if (!names.has(input.userId)) throw new AppError("NOT_FOUND", "User not found");
    await withTransaction(async (tx) => {
      const row = await dailyRepository.createFeedback(
        {
          authorId: user.id,
          authorName: user.name,
          targetUserId: input.userId,
          body: input.body,
        },
        tx,
      );
      await writeAudit(tx, {
        entity: "manager_feedback",
        entityId: row.id,
        actor: user.id,
        action: "mgr_feedback",
        after: { targetUserId: input.userId },
      });
    });
  },

  /**
   * Admin team breakdown (Wave 3.1 backlog, legacy `isAdmin`-only Daily Log table) — a
   * per-associate weekly rollup built from real self-reported `DailyLog` rows (NOT event-derived
   * live counts, matching legacy's own inputs). LEADERSHIP only, same tier as `setTarget`.
   */
  async teamBreakdown(weekStart: string, user: AuthUser): Promise<TeamBreakdownDTO> {
    if (!hasCapability(user.role, SET_TARGETS_CAP)) {
      throw new AppError("FORBIDDEN", "Only leadership can view the team breakdown");
    }
    const monday = mondayOf(weekStart);
    const weekEnd = daysAfter(monday, 6);
    const [logs, users] = await Promise.all([
      dailyRepository.logsForDateRange(monday, weekEnd),
      userRepository.list(),
    ]);
    const names = new Map(users.map((u) => [u.id, u.name]));
    const byUser = new Map<string, TeamBreakdownDTO["rows"][number]>();
    for (const log of logs) {
      const row = byUser.get(log.userId) ?? {
        userId: log.userId,
        name: names.get(log.userId) ?? "—",
        daysLogged: 0,
        sourced: 0,
        outreach: 0,
        responses: 0,
        screenings: 0,
        submitted: 0,
      };
      row.daysLogged += 1;
      row.sourced += log.sourced;
      row.outreach += log.outreach;
      row.responses += log.responses;
      row.screenings += log.screenings;
      row.submitted += log.submitted;
      byUser.set(log.userId, row);
    }
    return {
      weekStart: monday,
      rows: [...byUser.values()].sort((a, b) => b.sourced - a.sourced),
      teammates: users.map((u) => ({ id: u.id, name: u.name })),
    };
  },
};
