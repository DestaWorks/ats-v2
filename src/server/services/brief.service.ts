import "server-only";
import {
  ACTIVE_STATUS_CODES,
  BRIEF_CLIENT_CARD_LIMIT,
  BRIEF_STUCK_CANDIDATE_LIMIT,
} from "@/lib/constants";
import { daysBefore, dayWindow, mondayOf, rampFor, tenureWeek, weekWindow } from "@/lib/daily";
import type {
  DailyBriefDTO,
  GenerateDailyBriefInput,
  GenerateWeeklyBriefInput,
  SaveDailyBriefInput,
  SaveWeeklyBriefInput,
  SuggestTargetsInput,
  WeeklyBriefDTO,
  WeeklyPatternsInput,
} from "@/lib/validation/briefs";
import { toIso } from "@/lib/utils/iso";
import type { AuthUser } from "@/server/auth/guards";
import { writeAudit } from "@/server/db/audit";
import { withTransaction } from "@/server/db/with-transaction";
import { generateDailyBrief, type DailyBriefContext } from "@/server/ai/briefs/daily-brief";
import { generateWeeklyBrief, type WeeklyBriefContext } from "@/server/ai/briefs/weekly-brief";
import {
  generateWeeklyPatterns,
  type WeeklyPatternsWeek,
} from "@/server/ai/briefs/weekly-patterns";
import { suggestTargets as aiSuggestTargets } from "@/server/ai/briefs/targets-suggest";
import {
  briefRepository,
  type DailyBriefRow,
  type WeeklyBriefRow,
} from "@/server/repositories/brief.repository";
import { dailyRepository } from "@/server/repositories/daily.repository";
import { candidateRepository } from "@/server/repositories/candidate.repository";
import { leadRepository } from "@/server/repositories/lead.repository";
import { openRoleRepository } from "@/server/repositories/open-role.repository";
import { stageHistoryRepository } from "@/server/repositories/stage-history.repository";
import { clientRepository } from "@/server/repositories/client.repository";
import { userRepository } from "@/server/repositories/user.repository";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/http/app-error";

/** Candidates entering this status = a "hire" for the week's KPI ribbon (legacy: Status===Started). */
const HIRE_STATUS = "STARTED_DAY1";

function toDailyDTO(
  row: DailyBriefRow,
  priorityClientName: string | null,
  savedByName: string | null,
): DailyBriefDTO {
  return {
    date: row.date,
    headline: row.headline ?? "",
    exceptions: (row.exceptions as string[] | null) ?? [],
    yesterdayCheck: (row.yesterdayCheck as DailyBriefDTO["yesterdayCheck"] | null) ?? [],
    clientCards: (row.clientCards as DailyBriefDTO["clientCards"] | null) ?? [],
    perAssociate: (row.perAssociate as DailyBriefDTO["perAssociate"] | null) ?? [],
    teamPulse: row.teamPulse ?? "",
    priorityClientId: row.priorityClientId,
    shiftA: row.shiftA,
    shiftB: row.shiftB,
    watchItems: row.watchItems,
    savedByName,
    savedAt: row.savedAt ? toIso(row.savedAt) : null,
  };
}

function toWeeklyDTO(row: WeeklyBriefRow, savedByName: string | null): WeeklyBriefDTO {
  return {
    weekStart: row.weekStart,
    headline: row.headline ?? "",
    kpiNarrative: row.kpiNarrative ?? "",
    clientCards: (row.clientCards as WeeklyBriefDTO["clientCards"] | null) ?? [],
    perAssociate: (row.perAssociate as WeeklyBriefDTO["perAssociate"] | null) ?? [],
    lastWeekCheck: (row.lastWeekCheck as WeeklyBriefDTO["lastWeekCheck"] | null) ?? [],
    decisions: (row.decisions as string[] | null) ?? [],
    highlights: row.highlights ?? "",
    blockers: row.blockers ?? "",
    savedByName,
    savedAt: row.savedAt ? toIso(row.savedAt) : null,
  };
}

/** Top clients by CURRENT active-candidate count (legacy `perClient`, "top 5 by active count"). */
async function topClientsByActiveCandidates(): Promise<
  { clientName: string; activityCount: number }[]
> {
  const clients = await clientRepository.list();
  const counted = await Promise.all(
    clients.map(async (c) => ({
      clientName: c.name,
      activityCount: await candidateRepository.count({
        clientId: c.id,
        statuses: [...ACTIVE_STATUS_CODES],
      }),
    })),
  );
  return counted
    .filter((c) => c.activityCount > 0)
    .sort((a, b) => b.activityCount - a.activityCount)
    .slice(0, BRIEF_CLIENT_CARD_LIMIT);
}

export const briefService = {
  // --- Daily Brief ---

  /** Assemble live context + call the AI (legacy `daily_brief_generate`). Not persisted yet. */
  async generateDaily(
    input: GenerateDailyBriefInput,
    manualInputs: {
      priorityClientId: string | null;
      shiftA: string | null;
      shiftB: string | null;
      watchItems: string | null;
    },
  ) {
    const w = dayWindow(input.date, input.tz);
    const now = new Date();
    const [
      users,
      sourced,
      outreach,
      clientCards,
      stuckSourced,
      stuckOutreach,
      p1,
      p2,
      p3,
      topRoles,
      priorityClient,
      yesterdayRow,
    ] = await Promise.all([
      userRepository.list(),
      dailyRepository.sourcedCountsByRange(w),
      dailyRepository.outreachCountsByRange(w),
      topClientsByActiveCandidates(),
      leadRepository.stuckSourced(now, BRIEF_STUCK_CANDIDATE_LIMIT),
      leadRepository.stuckOutreach(now, BRIEF_STUCK_CANDIDATE_LIMIT),
      openRoleRepository.count({ status: "Open", priority: "P1" }),
      openRoleRepository.count({ status: "Open", priority: "P2" }),
      openRoleRepository.count({ status: "Open", priority: "P3" }),
      openRoleRepository.list({ status: "Open", take: 5 }),
      manualInputs.priorityClientId
        ? clientRepository.findById(manualInputs.priorityClientId)
        : null,
      briefRepository.findDailyByDate(daysBefore(input.date, 1)),
    ]);

    const perAssociate = await Promise.all(
      users.map(async (u) => ({
        name: u.name,
        sourced: sourced.get(u.id) ?? 0,
        outreach: outreach.get(u.id) ?? 0,
        assignedCandidates: await candidateRepository.count({
          createdById: u.id,
          statuses: [...ACTIVE_STATUS_CODES],
        }),
        stuckCount: await candidateRepository.count({ createdById: u.id, stuck: true }),
      })),
    );

    const ctx: DailyBriefContext = {
      date: input.date,
      perAssociate: perAssociate.filter(
        (a) => a.sourced > 0 || a.outreach > 0 || a.assignedCandidates > 0,
      ),
      clientCards,
      alerts: {
        stuckSourced: stuckSourced.map((l) => l.name),
        stuckOutreach: stuckOutreach.map((l) => l.name),
      },
      openRoles: { p1, p2, p3, top: topRoles.map((r) => r.title) },
      manualInputs: {
        priorityClientName: priorityClient?.name ?? null,
        shiftA: manualInputs.shiftA,
        shiftB: manualInputs.shiftB,
        watchItems: manualInputs.watchItems,
      },
      yesterday: yesterdayRow
        ? {
            exceptions: (yesterdayRow.exceptions as string[] | null) ?? [],
            perAssociate:
              (yesterdayRow.perAssociate as { name: string; todos: string[] }[] | null) ?? [],
          }
        : null,
    };
    return generateDailyBrief(ctx);
  },

  /** Persist the (possibly edited) draft + manual inputs (legacy `daily_brief_save`). */
  async saveDaily(input: SaveDailyBriefInput, user: AuthUser): Promise<DailyBriefDTO> {
    const row = await withTransaction(async (tx) => {
      const saved = await briefRepository.upsertDaily(
        {
          date: input.date,
          headline: input.headline,
          exceptions: input.exceptions,
          yesterdayCheck: input.yesterdayCheck,
          clientCards: input.clientCards,
          perAssociate: input.perAssociate,
          teamPulse: input.teamPulse,
          priorityClientId: input.priorityClientId ?? null,
          shiftA: input.shiftA ?? null,
          shiftB: input.shiftB ?? null,
          watchItems: input.watchItems ?? null,
          savedById: user.id,
          savedAt: new Date(),
        },
        tx,
      );
      await writeAudit(tx, {
        entity: "daily_brief",
        entityId: saved.id,
        actor: user.id,
        action: "save_daily_brief",
        after: { date: input.date },
      });
      return saved;
    });
    return toDailyDTO(row, row.priorityClientId, user.name);
  },

  async getDaily(date: string): Promise<DailyBriefDTO | null> {
    const row = await briefRepository.findDailyByDate(date);
    if (!row) return null;
    const names = row.savedById
      ? await userRepository.namesByIds([row.savedById])
      : new Map<string, string>();
    return toDailyDTO(
      row,
      row.priorityClientId,
      row.savedById ? (names.get(row.savedById) ?? null) : null,
    );
  },

  // --- Weekly Brief ---

  async generateWeekly(input: GenerateWeeklyBriefInput) {
    const weekStart = mondayOf(input.weekStart);
    const lastWeekStart = daysBefore(weekStart, 7);
    const thisW = weekWindow(weekStart, input.tz);
    const lastW = weekWindow(lastWeekStart, input.tz);

    const [users, thisTotals, lastTotals, clientCards, lastWeekRow] = await Promise.all([
      userRepository.list(),
      weekTotals(thisW),
      weekTotals(lastW),
      topClientsByActiveCandidates(),
      briefRepository.findWeeklyByWeekStart(lastWeekStart),
    ]);

    const [sourced, outreach, responses, promoted, hires] = await Promise.all([
      dailyRepository.sourcedCountsByRange(thisW),
      dailyRepository.outreachCountsByRange(thisW),
      dailyRepository.responseCountsByRange(thisW),
      dailyRepository.promotedCountsByRange(thisW),
      stageHistoryRepository.enteredStatusCountsByRange(HIRE_STATUS, thisW),
    ]);
    const perAssociate = users
      .map((u) => ({
        name: u.name,
        sourced: sourced.get(u.id) ?? 0,
        outreach: outreach.get(u.id) ?? 0,
        responses: responses.get(u.id) ?? 0,
        promoted: promoted.get(u.id) ?? 0,
        hires: hires.get(u.id) ?? 0,
      }))
      .filter((a) => a.sourced > 0 || a.outreach > 0 || a.promoted > 0 || a.hires > 0);

    const ctx: WeeklyBriefContext = {
      weekStart,
      weekEnd: daysBefore(weekStart, -6),
      thisWeek: thisTotals,
      lastWeek: lastTotals,
      perAssociate,
      clientCards,
      lastWeekBrief: lastWeekRow
        ? {
            highlights: lastWeekRow.highlights ?? "",
            blockers: lastWeekRow.blockers ?? "",
            nextWeekPriorities: lastWeekRow.nextWeekPriorities ?? "",
          }
        : null,
    };
    return generateWeeklyBrief(ctx);
  },

  async saveWeekly(input: SaveWeeklyBriefInput, user: AuthUser): Promise<WeeklyBriefDTO> {
    const weekStart = mondayOf(input.weekStart);
    const row = await withTransaction(async (tx) => {
      const saved = await briefRepository.upsertWeekly(
        {
          weekStart,
          headline: input.headline,
          kpiNarrative: input.kpiNarrative,
          clientCards: input.clientCards,
          perAssociate: input.perAssociate,
          lastWeekCheck: input.lastWeekCheck,
          decisions: input.decisions,
          highlights: input.highlights,
          blockers: input.blockers,
          statsSnapshot: {},
          savedById: user.id,
          savedAt: new Date(),
        },
        tx,
      );
      await writeAudit(tx, {
        entity: "weekly_brief",
        entityId: saved.id,
        actor: user.id,
        action: "save_weekly_brief",
        after: { weekStart },
      });
      return saved;
    });
    return toWeeklyDTO(row, user.name);
  },

  async getWeekly(weekStart: string): Promise<WeeklyBriefDTO | null> {
    const row = await briefRepository.findWeeklyByWeekStart(mondayOf(weekStart));
    if (!row) return null;
    const names = row.savedById
      ? await userRepository.namesByIds([row.savedById])
      : new Map<string, string>();
    return toWeeklyDTO(row, row.savedById ? (names.get(row.savedById) ?? null) : null);
  },

  /** 4-week pattern detection (legacy `weekly_brief_patterns`). Generate-only, never persisted. */
  async generatePatterns(input: WeeklyPatternsInput) {
    const weekStart = mondayOf(input.weekStart);
    const weekStarts = [0, 1, 2, 3].map((n) => daysBefore(weekStart, n * 7));
    const weeks: WeeklyPatternsWeek[] = await Promise.all(
      weekStarts.map(async (ws) => {
        const w = weekWindow(ws, input.tz);
        const [totals, sourced, outreach, responses] = await Promise.all([
          weekTotals(w),
          dailyRepository.sourcedCountsByRange(w),
          dailyRepository.outreachCountsByRange(w),
          dailyRepository.responseCountsByRange(w),
        ]);
        const names = await userRepository.namesByIds([
          ...new Set([...sourced.keys(), ...outreach.keys(), ...responses.keys()]),
        ]);
        const topAssociates = [...names.entries()]
          .map(([id, name]) => ({
            name,
            sourced: sourced.get(id) ?? 0,
            outreach: outreach.get(id) ?? 0,
            responses: responses.get(id) ?? 0,
          }))
          .sort((a, b) => b.sourced - a.sourced)
          .slice(0, 5);
        return { weekStart: ws, ...totals, topAssociates };
      }),
    );
    return generateWeeklyPatterns({ weeks });
  },

  // --- AI-suggested targets (legacy `ats_targets_suggest`) ---

  async suggestTargets(input: SuggestTargetsInput) {
    const [userRow, history] = await Promise.all([
      prisma.user.findUnique({
        where: { id: input.userId },
        select: { name: true, createdAt: true },
      }),
      dailyRepository.logsForUser(input.userId, 5),
    ]);
    if (!userRow) throw new AppError("NOT_FOUND", "User not found");
    const weekNum = tenureWeek(userRow.createdAt, input.date);
    const ramp = rampFor(weekNum);
    return aiSuggestTargets({
      associateName: userRow.name,
      date: input.date,
      ramp: { label: ramp.label, sourcing: ramp.sourced, outreach: ramp.outreach },
      recentDays: history.map((h) => ({ date: h.date, sourced: h.sourced, outreach: h.outreach })),
    });
  },
};

/** This-week/last-week KPI totals for the ribbon (sourced/outreach team-wide + promoted/hires). */
async function weekTotals(w: { start: Date; end: Date }) {
  const [sourced, outreach, responses, promoted, hires] = await Promise.all([
    dailyRepository.sourcedCountsByRange(w),
    dailyRepository.outreachCountsByRange(w),
    dailyRepository.responseCountsByRange(w),
    dailyRepository.promotedCountsByRange(w),
    stageHistoryRepository.enteredStatusCountsByRange(HIRE_STATUS, w),
  ]);
  const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
  return {
    sourced: sum(sourced),
    outreach: sum(outreach),
    responses: sum(responses),
    promoted: sum(promoted),
    hires: sum(hires),
  };
}
