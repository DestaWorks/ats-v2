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
