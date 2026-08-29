import type { JobDefinition, JobPayload, JobQueue } from "./queue";

/**
 * Schedules as DATA (SAAS-RESTRUCTURE-PLAN Phase 5, "Add the scheduler — nothing scheduled runs
 * today"). A schedule is a value in a registry, not a `setInterval` somewhere in a bootstrap file:
 * that is what makes the set of scheduled work enumerable, testable without a running process, and
 * identical in every worker — which the single-fire guarantee in `scheduler.ts` depends on, since
 * every worker must derive the SAME occurrence instant from the same definition.
 *
 * ## Whose 6am? — the timezone decision
 *
 * A recurring job has no viewer, so the per-request `app-tz` cookie that `viewer-tz.ts` reads is
 * not available to it, and the host's own zone must never stand in: on Vercel and in a container
 * the host is UTC by accident of hosting, and Phase 0.6 introduced the injected `Clock` precisely
 * because ambient host time silently answered a question nobody asked (a viewer at UTC+3 was
 * served the previous day's data).
 *
 * So: **every schedule states its own IANA time zone, and there is no default.** `timeZone` is a
 * required field. "Daily at 06:00" is not a schedule; "daily at 06:00 in `Africa/Addis_Ababa`" is.
 * The zone is a named IANA zone rather than a fixed offset on purpose — a fixed offset is wrong
 * for half the year in any DST zone, and a "6am report" that arrives at 5am for five months is
 * exactly the class of bug this is meant to prevent. Resolution goes through `Intl` with the real
 * tz database, so `America/New_York` 06:00 is 11:00Z in January and 10:00Z in July, correctly.
 */

/** A time of day in a schedule's own zone. 24-hour, no seconds — cron granularity, not timers. */
export interface LocalTimeOfDay {
  readonly hour: number;
  readonly minute: number;
}

/**
 * One scheduled job. `enqueue` is bound at definition time (see `dailySchedule`) so the registry
 * can hold schedules whose payload types differ while each one stays fully type-checked at the
 * point it is declared — the alternative, a payload widened to `unknown` in the registry, would
 * move the check to a cast.
 */
export interface Schedule {
  /** Stable identity. It is half of the claim key, so renaming one re-fires today's occurrence. */
  readonly name: string;
  readonly at: LocalTimeOfDay;
  /** IANA zone, e.g. `"Africa/Addis_Ababa"`. Required — see the module doc. */
  readonly timeZone: string;
  readonly enqueue: (queue: JobQueue, singletonKey: string) => Promise<string>;
}

/** Build a "every day at `at`, in `timeZone`" schedule for a job and a fixed payload. */
export function dailySchedule<TDefinition extends JobDefinition<unknown>>(spec: {
  readonly name: string;
  readonly at: LocalTimeOfDay;
  readonly timeZone: string;
  readonly job: TDefinition;
  readonly payload: JobPayload<TDefinition>;
}): Schedule {
  if (!Number.isInteger(spec.at.hour) || spec.at.hour < 0 || spec.at.hour > 23) {
    throw new RangeError(`Schedule ${spec.name}: hour out of range`);
  }
  if (!Number.isInteger(spec.at.minute) || spec.at.minute < 0 || spec.at.minute > 59) {
    throw new RangeError(`Schedule ${spec.name}: minute out of range`);
  }
  // Constructing a formatter is how an invalid zone is caught — at definition time, in the
  // process's first seconds, rather than at 6am when the job silently fails to appear.
  zoneFormatter(spec.timeZone);
  return {
    name: spec.name,
    at: spec.at,
    timeZone: spec.timeZone,
    enqueue: (queue, singletonKey) => queue.enqueue(spec.job, spec.payload, { singletonKey }),
  };
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Cached per zone — `Intl.DateTimeFormat` construction is expensive and a tick is on a loop. */
function zoneFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone);
  if (cached) return cached;
  const created = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  formatters.set(timeZone, created);
  return created;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** The wall-clock reading a person in `timeZone` would take off the wall at `instant`. */
function partsIn(timeZone: string, instant: Date): ZonedParts {
  const found: Record<string, number> = {};
  for (const part of zoneFormatter(timeZone).formatToParts(instant)) {
    if (part.type !== "literal") found[part.type] = Number(part.value);
  }
  const read = (key: string): number => {
    const value = found[key];
    if (value === undefined || !Number.isFinite(value)) {
      throw new RangeError(`Could not read ${key} in time zone ${timeZone}`);
    }
    return value;
  };
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

/** The zone's offset from UTC at `instant`, in ms (positive east of Greenwich). */
function offsetMsAt(timeZone: string, instant: Date): number {
  const p = partsIn(timeZone, instant);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Both sides are whole seconds; the instant's own milliseconds must not leak into the offset.
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The UTC instant at which the wall clock in `timeZone` reads the given local date and time.
 *
 * Two passes: the first guesses the offset from a UTC-shaped instant, the second re-reads it at
 * the guessed instant. That second pass is what makes a DST transition come out right — on the
 * day the clocks change, the offset that applies is the one in force AT the target, not the one
 * in force at the naive guess. On a spring-forward gap (a local time that does not exist) the
 * result lands just after the jump, which is the standard cron behaviour: run it late, not never.
 */
function instantAtLocal(timeZone: string, date: ZonedParts): Date {
  const naive = Date.UTC(date.year, date.month - 1, date.day, date.hour, date.minute, 0);
  const firstGuess = naive - offsetMsAt(timeZone, new Date(naive));
  const refined = naive - offsetMsAt(timeZone, new Date(firstGuess));
  return new Date(refined);
}

/**
 * The most recent instant at or before `now` when `schedule` was due.
 *
 * Pure and deterministic in (schedule, now): two workers on two machines with the same clock
 * reading compute the identical instant, which is what lets them race on one claim key instead of
 * each firing their own slightly different "6am".
 */
export function previousOccurrence(schedule: Schedule, now: Date): Date {
  const local = partsIn(schedule.timeZone, now);
  const today = instantAtLocal(schedule.timeZone, {
    ...local,
    hour: schedule.at.hour,
    minute: schedule.at.minute,
    second: 0,
  });
  if (today.getTime() <= now.getTime()) return today;
  // Before today's due time: step back one local day. Built from the local calendar date via
  // `Date.UTC`, so month and year roll over correctly and no 24-hour assumption is made about
  // the day's length.
  const previousDay = new Date(Date.UTC(local.year, local.month - 1, local.day - 1));
  return instantAtLocal(schedule.timeZone, {
    year: previousDay.getUTCFullYear(),
    month: previousDay.getUTCMonth() + 1,
    day: previousDay.getUTCDate(),
    hour: schedule.at.hour,
    minute: schedule.at.minute,
    second: 0,
  });
}

/** The identity of one firing: schedule + the exact instant it was due. */
export function occurrenceKey(scheduleName: string, occurrenceAt: Date): string {
  return `schedule:${scheduleName}:${occurrenceAt.toISOString()}`;
}
