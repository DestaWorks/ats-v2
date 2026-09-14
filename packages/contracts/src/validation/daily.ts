/**
 * Daily-loop contract (Wave 3.1) — isomorphic types + zod shared by the daily routes and the
 * Overview/Daily-Log clients. Pure (NO server imports). Day keys are user-local "YYYY-MM-DD"
 * strings; `tz` params carry the JS `getTimezoneOffset()` value so the SERVER counts within the
 * user's local day (see `lib/daily.ts`).
 */
import { z } from "zod";
import { DATE_KEY_RE, type RampPhase } from "@destaworks/domain/daily";

const dateKey = z.string().regex(DATE_KEY_RE, "Expected YYYY-MM-DD");
const metric = z.coerce.number().int().min(0).max(999);
export const tzOffsetSchema = z.coerce.number().int().min(-840).max(840).default(0);

/** clientId → sourced count. No FK — an ad-hoc `{ [clientId]: count }` shape (legacy parity).
 *  Size-capped defensively (legacy put no bound on this blob at all). */
const perClientCounts = z
  .record(z.string().min(1).max(40), metric)
  .refine((v) => Object.keys(v).length <= 20, "Too many clients")
  .optional();

// --- DTOs ---------------------------------------------------------------

/** A manager-set per-associate day target (legacy ATS_DailyTargets row). */
export interface DailyTargetDTO {
  userId: string;
  date: string;
  sourcing: number;
  outreach: number;
  atsCleanup: number;
  inbound: number;
  screens: number;
  priorityClientName: string | null;
  priorityRole: string | null;
  priorityState: string | null;
  notesFromYesterday: string | null;
  watchFor: string | null;
  setByName: string | null;
}

/** Event-derived live counts for a day (legacy `liveActuals` — inbound/screens have no source). */
export interface LiveActualsDTO {
  sourcing: number;
  outreach: number;
  atsCleanup: number;
}

/** The Overview strip composite. */
export interface DailyOverviewDTO {
  target: DailyTargetDTO | null;
  live: LiveActualsDTO;
  /** End-of-shift actuals already submitted for the day. */
  actualSubmitted: boolean;
  /** Viewer may set targets (leadership) — drives the banner button + modal. */
  canSetTargets: boolean;
  /**
   * Target-setting roster (present only when `canSetTargets`) — design pass 2026-08-04, legacy
   * `vw="brief"`'s "MANAGER · SET TODAY'S TARGETS" card grid (name + pending/set status + WTD
   * summary) that the new app was missing; previously just `{id, name}` for a plain picker.
   */
  teammates?: {
    id: string;
    name: string;
    hasTargetToday: boolean;
    weekSourced: number;
    weekOutreach: number;
    daysLoggedThisWeek: number;
  }[];
  clients?: { id: string; name: string }[];
}

/** "Since you closed" recap counts + first names (computed from domain tables, not audit). */
export interface RecapDTO {
  added: { count: number; names: string[] };
  moves: { count: number; names: string[] };
  outreach: { count: number; actors: string[] };
}

/** One self-reported Daily Log row. */
export interface DailyLogDTO {
  date: string;
  sourced: number;
  outreach: number;
  responses: number;
  screenings: number;
  submitted: number;
  blocker: string | null;
  notes: string | null;
  shiftHandoff: string | null;
  autoAdded: number;
  autoMoved: number;
  autoNotes: number;
}

export interface JournalEntryDTO {
  id: string;
  date: string;
  text: string;
  createdAt: string; // ISO
}

export interface JournalGoalDTO {
  id: string;
  weekStart: string;
  text: string;
  done: boolean;
}

/** Legacy "predictive pacing" (Daily Log) — see `lib/daily.ts::weeklyPacing`. */
export interface WeeklyPacingDTO {
  neededPerDay: number;
  projectedTotal: number;
}

/** One received manager-feedback note (Wave 3.1 backlog, legacy `mgr_feedback`). */
export interface ManagerFeedbackDTO {
  authorName: string | null;
  body: string;
  createdAt: string; // ISO
}

/** The Daily Log page composite. */
export interface DailyLogViewDTO {
  log: DailyLogDTO | null;
  auto: { added: number; moved: number; notes: number; verified: number };
  ramp: RampPhase & { weekNum: number };
  streak: number;
  history: DailyLogDTO[]; // last 10, newest first
  goals: JournalGoalDTO[]; // current (Monday-anchored) week
  entries: JournalEntryDTO[]; // recent journal notes, newest first
  /** Options for the optional "Sourced by client" breakdown (excludes non-recruiting placeholder
   *  clients — see `PER_CLIENT_BREAKDOWN_EXCLUDED` in `daily.service.ts`). */
  clients: { id: string; name: string }[];
  /** This Monday-anchored week's self-reported sourcing so far — the "predictive pacing" input. */
  weekTotals: { sourced: number; days: number };
  pacing: WeeklyPacingDTO;
  /** Last 2 manager-feedback notes addressed to the SESSION user, newest first. */
  feedback: ManagerFeedbackDTO[];
}

/** One row of `GET /api/daily/team-breakdown` — a per-associate weekly self-report rollup
 *  (legacy's `isAdmin`-only Daily Log table). Built from self-reported `DailyLog` rows, NOT
 *  event-derived live counts — matches legacy's own inputs. Omits legacy's "quality %" column
 *  (advanced-past-status-index-3 ratio) — a second, heavier query not worth the complexity for
 *  this low-priority item; a follow-up if actually wanted. */
export interface TeamBreakdownRowDTO {
  userId: string;
  name: string;
  daysLogged: number;
  sourced: number;
  outreach: number;
  responses: number;
  screenings: number;
  submitted: number;
}
export interface TeamBreakdownDTO {
  weekStart: string;
  rows: TeamBreakdownRowDTO[];
  /** The full roster (not just associates who logged this week) — for the feedback composer's
   *  target picker, which must reach anyone, not only whoever shows up in `rows`. */
  teammates: { id: string; name: string }[];
}

/** `GET /api/daily/team-breakdown?weekStart=` — `viewReports` only (enforced server-side). */
export const teamBreakdownQuerySchema = z.object({ weekStart: dateKey });
export type TeamBreakdownQuery = z.infer<typeof teamBreakdownQuerySchema>;

/** `POST /api/daily/manager-feedback` — `viewReports` only (a manager acting on an associate,
 *  same tier as `setTargetSchema` below — never Owner/Admin-only `manageUsers`). */
export const addFeedbackSchema = z
  .object({
    userId: z.string().min(1),
    body: z.string().trim().min(1).max(2000),
  })
  .strict();
export type AddFeedbackInput = z.infer<typeof addFeedbackSchema>;

// --- request schemas ------------------------------------------------------

/** `POST /api/daily/targets` (leadership only) — set/replace one associate's day targets. */
export const setTargetSchema = z
  .object({
    userId: z.string().min(1),
    date: dateKey,
    sourcing: metric,
    outreach: metric,
    atsCleanup: metric,
    inbound: metric,
    screens: metric,
    priorityClientId: z.string().min(1).nullish(),
    priorityRole: z.string().trim().max(200).nullish(),
    priorityState: z.string().trim().max(60).nullish(),
    notesFromYesterday: z.string().trim().max(2000).nullish(),
    watchFor: z.string().trim().max(2000).nullish(),
  })
  .strict();
export type SetTargetInput = z.infer<typeof setTargetSchema>;

/** `POST /api/daily/actuals` — End of Shift (self; upsert for the day). */
export const saveActualsSchema = z
  .object({
    date: dateKey,
    sourcing: metric,
    outreach: metric,
    atsCleanup: metric,
    inbound: metric,
    screens: metric,
    note: z.string().trim().max(2000).nullish(),
    shiftHandoff: z.string().trim().max(2000).nullish(),
    perClientSourcing: perClientCounts,
  })
  .strict();
export type SaveActualsInput = z.infer<typeof saveActualsSchema>;

/** `POST /api/daily/log` — the Daily Log self-report (one per user/day; server snapshots autos). */
export const submitLogSchema = z
  .object({
    date: dateKey,
    tz: tzOffsetSchema,
    sourced: metric,
    outreach: metric,
    responses: metric,
    screenings: metric,
    submitted: metric,
    blocker: z.string().trim().max(200).nullish(),
    notes: z.string().trim().max(5000).nullish(),
    shiftHandoff: z.string().trim().max(2000).nullish(),
    perClient: perClientCounts,
  })
  .strict();
export type SubmitLogInput = z.infer<typeof submitLogSchema>;

export const journalEntrySchema = z
  .object({ date: dateKey, text: z.string().trim().min(1).max(5000) })
  .strict();

export const journalGoalSchema = z
  .object({ weekStart: dateKey, text: z.string().trim().min(1).max(500) })
  .strict();

export const toggleGoalSchema = z.object({ done: z.boolean() }).strict();

/**
 * `GET /api/daily/recap?since=<ISO>` — how far back the "Since you closed" buckets look.
 *
 * The server clamps it to `RECAP_MAX_LOOKBACK_DAYS`: a stale `localStorage` timestamp must not
 * turn a page load into a scan of the whole history.
 */
export const recapQuerySchema = z.object({ since: z.coerce.date() });
export const RECAP_MAX_LOOKBACK_DAYS = 14;

// --- Response shapes -------------------------------------------------------
//
// Wire shapes that wrap a DTO or acknowledge a write. They live here, beside the DTOs they wrap,
// so the Next.js route and the API controller serving the same endpoint import ONE definition of
// the body instead of each declaring its own.

/** A write that returns nothing but its own success. */
export interface AcknowledgedDTO {
  ok: true;
}

/** `POST /api/daily/log` — the day's self-report as persisted. */
export interface SubmittedLogDTO {
  log: DailyLogDTO;
}

/** `POST /api/daily/journal/entries` — the note just added. */
export interface CreatedJournalEntryDTO {
  entry: JournalEntryDTO;
}

/** `POST /api/daily/journal/goals` — the weekly goal just added. */
export interface CreatedJournalGoalDTO {
  goal: JournalGoalDTO;
}

/** Legacy blocker vocabulary (Daily Log dropdown, ported verbatim). */
export const BLOCKERS = [
  "Indeed credits low",
  "Indeed credits exhausted",
  "Farhaz unavailable",
  "No candidates in target state",
  "ATS access issue",
  "Internet connectivity",
  "Waiting on client feedback",
  "Training needed",
  "Other",
] as const;
