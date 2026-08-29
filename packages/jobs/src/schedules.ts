import { scheduleRunRepository } from "@destaworks/db/repositories/schedule-run.repository";
import { reportExportJob } from "./definitions/report-export.job";
import { dailySchedule, type Schedule } from "./schedule";
import type { ScheduleClaimStore } from "./scheduler";

/**
 * The schedule registry — the complete, enumerable list of everything this app runs on a clock.
 *
 * ## It is empty, on purpose
 *
 * Phase 5 asks for the mechanism ("add the scheduler — nothing scheduled runs today"), not for
 * new recurring business jobs. Nothing in the codebase or the plan currently expects work to
 * happen on a timer: the daily and weekly briefs are generated on demand and keyed by the day the
 * user asks for (`daily_briefs.date`, `weekly_briefs.weekStart`), the reports are computed per
 * request, and the ETL (Phase 7) is a one-shot cutover, not a recurrence. Inventing a nightly
 * brief or a compliance sweep here would be inventing product, and each invented schedule is a
 * job that runs unattended against real PII every night for the rest of the app's life.
 *
 * So the live registry is empty and the mechanism is proven by tests. The first real schedule
 * should be added here, by whoever owns the feature that needs it, with an explicit time zone.
 */
export const SCHEDULES: readonly Schedule[] = [];

/**
 * A worked example — NOT registered, and not something the product asked for. It exists so the
 * shape of a real schedule is written down next to the empty registry: a stable name, a time of
 * day, and the zone that time of day is stated in.
 *
 * Note the zone is a literal, not `process.env.TZ` and not the host's: see the "Whose 6am?" note
 * in `schedule.ts`. A schedule that inherits its zone from wherever it happens to run is the bug
 * the injected `Clock` was introduced to end.
 */
export const EXAMPLE_DAILY_EXPORT_SCHEDULE: Schedule = dailySchedule({
  name: "example.daily-candidate-export",
  at: { hour: 6, minute: 0 },
  timeZone: "Africa/Addis_Ababa",
  job: reportExportJob,
  payload: { exportId: "example", filters: {} },
});

/**
 * The durable claim store, backed by the uniquely-indexed `schedule_runs` table. This adapter is
 * the whole of the scheduler's coupling to Postgres — the `Scheduler` itself takes the port, so a
 * test substitutes an in-memory store and races two schedulers without a database.
 */
export const prismaScheduleClaimStore: ScheduleClaimStore = {
  claim: (schedule, occurrenceAt) => scheduleRunRepository.claim(schedule, occurrenceAt),
  release: (schedule, occurrenceAt) => scheduleRunRepository.release(schedule, occurrenceAt),
};
