import { systemClock, type Clock } from "@destaworks/domain/clock";
import { logger } from "@destaworks/config/logger";
import type { JobQueue } from "./queue";
import { occurrenceKey, previousOccurrence, type Schedule } from "./schedule";

/**
 * The scheduler: the first thing in this app that runs without a request behind it.
 *
 * ## Why it is safe to run more than one worker
 *
 * The app is deployed as more than one process, and a scheduler that assumes it is alone fires
 * every schedule once per process — the classic "the nightly email went out four times" failure.
 * Leader election was rejected (a lease, a heartbeat, and a split-brain window to reason about);
 * so was "only the first replica schedules" (invisible, and wrong the moment that replica is the
 * one that restarts). What is here instead has no coordination at all:
 *
 * 1. Every worker ticks on its own timer and computes the SAME occurrence instant, because
 *    `previousOccurrence` is a pure function of (schedule, now) and the schedules are data every
 *    worker loads identically.
 * 2. Before enqueuing, a worker must insert `(schedule, occurrenceAt)` into `schedule_runs`,
 *    which is uniquely indexed. Postgres decides the winner; the losers get a unique violation
 *    and do nothing. One row per occurrence, therefore one enqueue per occurrence, for any number
 *    of workers and any interleaving of their ticks.
 * 3. The enqueue additionally carries the occurrence as the queue's `singletonKey`, so a driver
 *    that supports it collapses duplicates too. That is defence in depth, NOT the guarantee —
 *    `singletonKey` only dedupes jobs that are still pending, so a job that finishes between two
 *    workers' ticks would slip through it. The claim row is what actually holds.
 *
 * The claim is taken BEFORE the enqueue and released if the enqueue throws. Claim-then-enqueue
 * risks losing an occurrence if the process dies in between; enqueue-then-claim risks running it
 * twice. For a cron, at-most-once is the right side of that trade — and the release plus the
 * catch-up window below narrow the loss to a process death inside a few milliseconds.
 *
 * ## The catch-up window
 *
 * A tick only fires an occurrence that is at most `catchUpWindowMs` old. Without it, a worker
 * that boots at noon would immediately fire that morning's 6am job, and every deploy would
 * re-run the day's schedules; with it, a schedule missed because nothing was running stays
 * missed, visibly, until its next occurrence. The window must comfortably exceed the tick
 * interval or an occurrence can fall between two ticks and never fire at all.
 */

export interface ScheduleClaimStore {
  /**
   * Atomically claim one occurrence, returning whether THIS caller won it. The atomicity has to
   * be real across processes — a read-then-write in application code is not enough.
   */
  claim(schedule: string, occurrenceAt: Date): Promise<boolean>;
  /** Give a won claim back so a later tick inside the catch-up window may retry it. */
  release(schedule: string, occurrenceAt: Date): Promise<void>;
}

export interface SchedulerOptions {
  readonly schedules: readonly Schedule[];
  readonly queue: JobQueue;
  readonly claims: ScheduleClaimStore;
  /** Injected, never ambient (Phase 0.6) — a test pins the instant instead of racing the host. */
  readonly clock?: Clock;
  readonly tickIntervalMs?: number;
  readonly catchUpWindowMs?: number;
}

const DEFAULT_TICK_INTERVAL_MS = 30_000;
/** Ten minutes: long enough to survive a slow deploy or a paused container, short enough that a
 *  job which fires late is still recognisably "this morning's". */
const DEFAULT_CATCH_UP_WINDOW_MS = 600_000;

export class Scheduler {
  private readonly schedules: readonly Schedule[];
  private readonly queue: JobQueue;
  private readonly claims: ScheduleClaimStore;
  private readonly clock: Clock;
  private readonly tickIntervalMs: number;
  private readonly catchUpWindowMs: number;
  private timer: ReturnType<typeof setInterval> | undefined;
  private ticking = false;

  constructor(options: SchedulerOptions) {
    this.schedules = options.schedules;
    this.queue = options.queue;
    this.claims = options.claims;
    this.clock = options.clock ?? systemClock;
    this.tickIntervalMs = options.tickIntervalMs ?? DEFAULT_TICK_INTERVAL_MS;
    this.catchUpWindowMs = options.catchUpWindowMs ?? DEFAULT_CATCH_UP_WINDOW_MS;
    if (this.catchUpWindowMs <= this.tickIntervalMs) {
      throw new RangeError(
        "catchUpWindowMs must exceed tickIntervalMs, or an occurrence can fall between two ticks",
      );
    }
  }

  /**
   * Begin ticking. ONE interval for the whole registry, rather than one timer per schedule —
   * adding a schedule must not add a timer, or the set of things that can fire stops being
   * enumerable. Idempotent: calling it twice does not double the rate.
   */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.tickIntervalMs);
    // Never hold a process open on the scheduler's account; a worker exits when its work does.
    this.timer.unref?.();
    logger.info("scheduler.started", {
      schedules: this.schedules.length,
      tickIntervalMs: this.tickIntervalMs,
    });
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
    logger.info("scheduler.stopped", {});
  }

  /**
   * One pass over every schedule. Public because a test drives it directly with a fixed clock,
   * and because it is the honest unit: `start` is only a timer around it.
   *
   * Overlapping ticks are skipped rather than queued — a tick that is still running has already
   * claimed everything the next one would look at, so piling them up only multiplies database
   * round trips during an incident.
   */
  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const now = this.clock.now();
      await Promise.all(this.schedules.map((schedule) => this.fire(schedule, now)));
    } finally {
      this.ticking = false;
    }
  }

  /**
   * One schedule, one tick. Failures are logged and swallowed: a tick loop that throws stops
   * ticking, and one broken schedule must not silence the rest.
   */
  private async fire(schedule: Schedule, now: Date): Promise<void> {
    let occurrenceAt: Date;
    try {
      occurrenceAt = previousOccurrence(schedule, now);
      if (now.getTime() - occurrenceAt.getTime() > this.catchUpWindowMs) return;
      if (!(await this.claims.claim(schedule.name, occurrenceAt))) return;
    } catch (err) {
      logger.error("scheduler.tick_failed", {
        schedule: schedule.name,
        errorType: err instanceof Error ? err.name : "UnknownError",
      });
      return;
    }
    try {
      const jobId = await schedule.enqueue(this.queue, occurrenceKey(schedule.name, occurrenceAt));
      logger.info("scheduler.enqueued", {
        schedule: schedule.name,
        occurrenceAt: occurrenceAt.toISOString(),
        jobId,
      });
    } catch (err) {
      await this.releaseQuietly(schedule, occurrenceAt);
      logger.error("scheduler.enqueue_failed", {
        schedule: schedule.name,
        occurrenceAt: occurrenceAt.toISOString(),
        errorType: err instanceof Error ? err.name : "UnknownError",
      });
    }
  }

  /** A failed release only costs the occurrence; it must not mask the enqueue error above it. */
  private async releaseQuietly(schedule: Schedule, occurrenceAt: Date): Promise<void> {
    try {
      await this.claims.release(schedule.name, occurrenceAt);
    } catch (err) {
      logger.error("scheduler.release_failed", {
        schedule: schedule.name,
        occurrenceAt: occurrenceAt.toISOString(),
        errorType: err instanceof Error ? err.name : "UnknownError",
      });
    }
  }
}
