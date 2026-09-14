/**
 * Daily-loop pure helpers (isomorphic — client renders with them, server counts with them).
 * THE one date/week definition (D5 / plan 3.1): day keys are the USER-LOCAL calendar date as a
 * "YYYY-MM-DD" string; weeks are MONDAY-anchored. Legacy had three competing week anchors
 * (Monday for targets, Sunday for logs/journal, a hardcoded tenure epoch) — all consolidated.
 *
 * Every instant-reading helper here takes a `Clock` (defaulting to `systemClock`) rather than
 * calling `new Date()` itself, so "today" is a value a test can pin.
 */

import { MS_PER_DAY, systemClock, type Clock } from "./clock";

export const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Widest sane `Date.getTimezoneOffset()` values (UTC-14 .. UTC+14), in minutes behind UTC. */
const TZ_OFFSET_MIN = -840;
const TZ_OFFSET_MAX = 840;

/**
 * Parse an `app-tz` cookie / `tz` query value into a `Date.getTimezoneOffset()` offset, or
 * `undefined` when it is absent or out of range. One shared parser so the pages and the API
 * routes that both read that cookie cannot drift apart on what counts as valid.
 */
export function parseTzOffset(raw: string | null | undefined): number | undefined {
  if (raw === null || raw === undefined || raw === "") return undefined;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= TZ_OFFSET_MIN && parsed <= TZ_OFFSET_MAX
    ? parsed
    : undefined;
}

/**
 * The HOST-local calendar-date key. Correct in the browser (the host IS the user); on the
 * server the host is UTC, so server code must use `dateKeyForOffset` with the viewer's own
 * offset instead — see that function.
 */
export function dateKey(clock: Clock = systemClock): string {
  const d = clock.now();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * The USER-LOCAL calendar-date key for a given tz offset — the server-side "today". The server
 * host runs in UTC, so `dateKey()` there answers the host's question, not the user's: at
 * 22:30Z a viewer in UTC+3 is already on the next calendar day, and a viewer in UTC-5 is still
 * on the previous one. Same sign convention as `dayWindow`/`Date.getTimezoneOffset()` (minutes
 * BEHIND UTC).
 */
export function dateKeyForOffset(tzOffsetMinutes: number, clock: Clock = systemClock): string {
  const local = new Date(clock.now().getTime() - tzOffsetMinutes * 60_000);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-${String(local.getUTCDate()).padStart(2, "0")}`;
}

/**
 * THE UTC day-bound pair. Ranges are HALF-OPEN, `[utcDayStart(from), utcNextDayStart(to))`:
 * consecutive days tile the timeline with no gap and no overlap (the same `[start, end)`
 * convention `dayWindow`/`weekWindow` below already use), and the bound stays correct whatever
 * sub-second precision the column happens to have. The `23:59:59.999` "inclusive end" spelling
 * this replaces silently dropped anything later in the final second.
 */
export function utcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** The start of the NEXT UTC day — the EXCLUSIVE upper bound that makes `to`'s day inclusive. */
export function utcNextDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
}

/** Whole UTC calendar days from `from`'s day to `to`'s day — negative once `to` is in the past. */
export function utcDaysBetween(from: Date, to: Date): number {
  return Math.round((utcDayStart(to).getTime() - utcDayStart(from).getTime()) / MS_PER_DAY);
}

/**
 * Whole calendar months elapsed from `start` to `now`, clamped at 0. Calendar-correct (a month
 * is 28-31 days, never a flat 30) and never negative for a future-dated `start`.
 */
export function elapsedMonths(start: Date, now: Date): number {
  let months =
    (now.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - start.getUTCMonth());
  const anniversary = new Date(start.getTime());
  anniversary.setUTCMonth(start.getUTCMonth() + months);
  if (anniversary.getTime() > now.getTime()) months -= 1;
  return Math.max(0, months);
}

/** The Monday of the week containing `key` (Monday-anchored, the ONE week definition). */
export function mondayOf(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0 Sun .. 6 Sat
  const back = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

/** The key `n` days before `key`. */
export function daysBefore(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** The key `n` days after `key` (e.g. `daysAfter(monday, 6)` = that week's Sunday). */
export function daysAfter(key: string, n: number): string {
  return daysBefore(key, -n);
}

/**
 * The UTC instant window `[start, end)` of a user-local calendar day. `tzOffsetMinutes` is the
 * JS `Date.getTimezoneOffset()` value (minutes BEHIND UTC — e.g. -180 for UTC+3), so
 * local-midnight = utc-midnight + offset.
 */
export function dayWindow(key: string, tzOffsetMinutes: number): { start: Date; end: Date } {
  const utcMidnight = new Date(`${key}T00:00:00Z`).getTime();
  const start = utcMidnight + tzOffsetMinutes * 60_000;
  return { start: new Date(start), end: new Date(start + MS_PER_DAY) };
}

/**
 * The UTC instant window `[start, end)` of a Monday-anchored ISO week (7 days from `weekStart`,
 * the ONE week definition — see module doc). Used by Wave 5.1's Weekly Brief so "this week"
 * always means the same thing as `mondayOf` everywhere else in the app.
 */
export function weekWindow(weekStart: string, tzOffsetMinutes: number): { start: Date; end: Date } {
  const { start } = dayWindow(weekStart, tzOffsetMinutes);
  return { start, end: new Date(start.getTime() + 7 * MS_PER_DAY) };
}

/** Pace status vs a 9am–5pm linear ramp (legacy `expectedByNow`): hit / on pace / behind. */
export type PaceStatus = "hit" | "on pace" | "behind";
export function paceStatus(actual: number, target: number, hour: number): PaceStatus {
  if (!target || actual >= target) return "hit";
  const expected = Math.round(target * Math.min(1, Math.max(0, (hour - 9) / 8)));
  return actual >= expected ? "on pace" : "behind";
}

/** Tenure-ramp KPI phase (legacy ramp table; weekNum counted from the USER's start date). */
export interface RampPhase {
  label: string;
  sourced: number;
  outreach: number;
  responses: number;
  screenings: number;
  submitted: number;
}
export function rampFor(weekNum: number): RampPhase {
  if (weekNum <= 2) {
    return {
      label: "Week 1-2: Training Phase",
      sourced: 15,
      outreach: 10,
      responses: 2,
      screenings: 1,
      submitted: 0,
    };
  }
  if (weekNum <= 4) {
    return {
      label: "Week 2-4: Ramp Phase",
      sourced: 20,
      outreach: 20,
      responses: 4,
      screenings: 3,
      submitted: 1,
    };
  }
  return {
    label: "Month 2+: Full Production",
    sourced: 30,
    outreach: 25,
    responses: 5,
    screenings: 5,
    submitted: 3,
  };
}

/** Whole weeks (1-based) between a start instant and `key`'s day — the tenure `weekNum`. */
export function tenureWeek(startedAt: Date, key: string): number {
  const days = Math.max(
    0,
    Math.floor((new Date(`${key}T00:00:00Z`).getTime() - startedAt.getTime()) / MS_PER_DAY),
  );
  return Math.floor(days / 7) + 1;
}

/**
 * Consecutive prior days (up to 14 back, legacy cap) where the self-reported `sourced` hit the
 * ramp target. `logsByDate` maps date keys → sourced counts; the streak starts at yesterday.
 */
export function sourcingStreak(
  todayKeyStr: string,
  logsByDate: Map<string, number>,
  target: number,
): number {
  let streak = 0;
  for (let i = 1; i <= 14; i++) {
    const key = daysBefore(todayKeyStr, i);
    const sourced = logsByDate.get(key);
    if (sourced !== undefined && sourced >= target) streak++;
    else break;
  }
  return streak;
}

/** Business (Mon-Fri) days remaining in `key`'s week, INCLUSIVE of `key` itself if it's a
 *  weekday — 0 on a weekend (legacy's own 5-day work-week assumption for pacing). */
export function businessDaysLeft(key: string): number {
  const dow = new Date(`${key}T00:00:00Z`).getUTCDay(); // 0 Sun .. 6 Sat
  if (dow === 0 || dow === 6) return 0;
  return 5 - dow + 1;
}

export interface WeeklyPacing {
  neededPerDay: number;
  projectedTotal: number;
}

/**
 * Legacy "predictive pacing" (Daily Log, `index.html:2208-2210`) — a linear projection of the
 * rolling Monday-anchored week's self-reported sourcing against the daily ramp target (a 5-day
 * work week). `daysLogged` is how many days this week already have a submitted log (drives the
 * average in `projectedTotal`); `daysLeft` is business days remaining INCLUSIVE of today
 * (`businessDaysLeft`); `todayAlreadyLogged` says whether today's own log is already among
 * `weekSourced`/`daysLogged`, in which case today is NOT a day still available to work — it is
 * counted once, on the "done" side, and dropped from the remaining-days divisor.
 * `neededPerDay` is clamped to 0 (legacy's raw `ceil` can go negative once the week's target is
 * already hit — a negative "needed per day" reads as a bug, not a signal, so it's floored here).
 */
export function weeklyPacing(
  weekSourced: number,
  dailyTarget: number,
  daysLogged: number,
  daysLeft: number,
  todayAlreadyLogged: boolean,
): WeeklyPacing {
  const weeklyTarget = dailyTarget * 5;
  const daysRemaining = Math.max(0, daysLeft - (todayAlreadyLogged ? 1 : 0));
  const neededPerDay =
    daysRemaining > 0 ? Math.max(0, Math.ceil((weeklyTarget - weekSourced) / daysRemaining)) : 0;
  const projectedTotal = daysLogged > 0 ? Math.round((weekSourced / daysLogged) * 5) : 0;
  return { neededPerDay, projectedTotal };
}
