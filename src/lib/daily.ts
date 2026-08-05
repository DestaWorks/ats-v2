/**
 * Daily-loop pure helpers (isomorphic — client renders with them, server counts with them).
 * THE one date/week definition (D5 / plan 3.1): day keys are the USER-LOCAL calendar date as a
 * "YYYY-MM-DD" string; weeks are MONDAY-anchored. Legacy had three competing week anchors
 * (Monday for targets, Sunday for logs/journal, a hardcoded tenure epoch) — all consolidated.
 */

export const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The local calendar-date key for a Date (defaults to now). */
export function dateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * The user-local calendar-date key for a given tz offset, computed from the CURRENT instant —
 * the server-side equivalent of `dateKey()` when the caller only has the browser's UTC offset
 * minutes (not a real local `Date`), e.g. an RSC render seeded from a client-set tz cookie.
 * Same sign convention as `dayWindow`/`Date.getTimezoneOffset()` (minutes BEHIND UTC).
 */
export function dateKeyForOffset(tzOffsetMinutes: number, now: Date = new Date()): string {
  const local = new Date(now.getTime() - tzOffsetMinutes * 60_000);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-${String(local.getUTCDate()).padStart(2, "0")}`;
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
  return { start: new Date(start), end: new Date(start + 86_400_000) };
}

/**
 * The UTC instant window `[start, end)` of a Monday-anchored ISO week (7 days from `weekStart`,
 * the ONE week definition — see module doc). Used by Wave 5.1's Weekly Brief so "this week"
 * always means the same thing as `mondayOf` everywhere else in the app.
 */
export function weekWindow(weekStart: string, tzOffsetMinutes: number): { start: Date; end: Date } {
  const { start } = dayWindow(weekStart, tzOffsetMinutes);
  return { start, end: new Date(start.getTime() + 7 * 86_400_000) };
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
    Math.floor((new Date(`${key}T00:00:00Z`).getTime() - startedAt.getTime()) / 86_400_000),
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
 * average in `projectedTotal`); `daysLeft` is business days remaining (`businessDaysLeft`).
 * `neededPerDay` is clamped to 0 (legacy's raw `ceil` can go negative once the week's target is
 * already hit — a negative "needed per day" reads as a bug, not a signal, so it's floored here).
 */
export function weeklyPacing(
  weekSourced: number,
  dailyTarget: number,
  daysLogged: number,
  daysLeft: number,
): WeeklyPacing {
  const weeklyTarget = dailyTarget * 5;
  const neededPerDay =
    daysLeft > 0 ? Math.max(0, Math.ceil((weeklyTarget - weekSourced) / daysLeft)) : 0;
  const projectedTotal = daysLogged > 0 ? Math.round((weekSourced / daysLogged) * 5) : 0;
  return { neededPerDay, projectedTotal };
}
