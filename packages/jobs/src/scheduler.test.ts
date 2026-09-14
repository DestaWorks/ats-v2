import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { advanceableClock, fixedClock } from "@destaworks/domain/clock";
import type { JobDefinition, JobQueue } from "./queue";
import { dailySchedule } from "./schedule";
import { Scheduler, type ScheduleClaimStore } from "./scheduler";

/**
 * The single-fire proof. Every test here runs TWO schedulers against one shared claim store and
 * one shared queue, because one scheduler firing once proves nothing — the failure this design
 * exists to prevent only appears with more than one worker.
 */

const noopJob: JobDefinition<unknown> = {
  name: "test.noop",
  schema: z.unknown(),
  maxAttempts: 1,
  timeoutMs: 1_000,
};

/** 06:00 in Addis Ababa (UTC+3) — 03:00Z. */
const schedule = dailySchedule({
  name: "test.daily",
  at: { hour: 6, minute: 0 },
  timeZone: "Africa/Addis_Ababa",
  job: noopJob,
  payload: undefined,
});

/**
 * The in-memory stand-in for `schedule_runs`. The check and the insert happen with no `await`
 * between them, which is what makes it a faithful model of a unique index on a single-threaded
 * runtime: no interleaving can put two callers inside the gap.
 */
function memoryClaimStore(): ScheduleClaimStore & { size: () => number } {
  const claimed = new Set<string>();
  const key = (schedule: string, at: Date) => `${schedule}@${at.toISOString()}`;
  return {
    claim: (name, at) => {
      const k = key(name, at);
      if (claimed.has(k)) return Promise.resolve(false);
      claimed.add(k);
      return Promise.resolve(true);
    },
    release: (name, at) => {
      claimed.delete(key(name, at));
      return Promise.resolve();
    },
    size: () => claimed.size,
  };
}

function recordingQueue(): JobQueue & { calls: { singletonKey: string | undefined }[] } {
  const calls: { singletonKey: string | undefined }[] = [];
  return {
    calls,
    enqueue: (_definition, _payload, options) => {
      calls.push({ singletonKey: options?.singletonKey });
      return Promise.resolve(`job-${calls.length}`);
    },
  };
}

const DUE = "2026-03-10T03:00:00.000Z";

let queue: ReturnType<typeof recordingQueue>;
let claims: ReturnType<typeof memoryClaimStore>;

beforeEach(() => {
  queue = recordingQueue();
  claims = memoryClaimStore();
});

function schedulerAt(now: string, overrides?: { catchUpWindowMs?: number }): Scheduler {
  return new Scheduler({
    schedules: [schedule],
    queue,
    claims,
    clock: fixedClock(now),
    tickIntervalMs: 1_000,
    catchUpWindowMs: overrides?.catchUpWindowMs ?? 600_000,
  });
}

describe("two workers racing on one occurrence", () => {
  it("enqueues exactly once when both tick simultaneously", async () => {
    const a = schedulerAt(DUE);
    const b = schedulerAt(DUE);
    await Promise.all([a.tick(), b.tick()]);
    expect(queue.calls).toHaveLength(1);
    expect(claims.size()).toBe(1);
  });

  it("enqueues exactly once when they tick one after the other", async () => {
    await schedulerAt(DUE).tick();
    await schedulerAt("2026-03-10T03:00:30.000Z").tick();
    expect(queue.calls).toHaveLength(1);
  });

  it("stays at one across many ticks by many workers inside the catch-up window", async () => {
    const workers = ["a", "b", "c", "d", "e"].map(() => schedulerAt("2026-03-10T03:05:00.000Z"));
    await Promise.all(workers.flatMap((w) => [w.tick(), w.tick()]));
    expect(queue.calls).toHaveLength(1);
  });

  it("tags the enqueue with the occurrence, so a driver can dedupe too", async () => {
    await schedulerAt(DUE).tick();
    expect(queue.calls[0]?.singletonKey).toBe(`schedule:test.daily:${DUE}`);
  });

  it("fires again for the NEXT day's occurrence — dedupe is per occurrence, not per schedule", async () => {
    await schedulerAt(DUE).tick();
    await schedulerAt("2026-03-11T03:00:00.000Z").tick();
    expect(queue.calls).toHaveLength(2);
  });
});

describe("the catch-up window", () => {
  it("does not fire an occurrence older than the window — a late boot is not a trigger", async () => {
    await schedulerAt("2026-03-10T09:00:00.000Z").tick();
    expect(queue.calls).toHaveLength(0);
  });

  it("does fire one still inside the window", async () => {
    await schedulerAt("2026-03-10T03:09:00.000Z").tick();
    expect(queue.calls).toHaveLength(1);
  });

  it("does not fire before the occurrence is due", async () => {
    await schedulerAt("2026-03-10T02:59:59.999Z").tick();
    expect(queue.calls).toHaveLength(0);
  });

  it("refuses a window that does not exceed the tick interval", () => {
    expect(
      () =>
        new Scheduler({
          schedules: [schedule],
          queue,
          claims,
          clock: fixedClock(DUE),
          tickIntervalMs: 60_000,
          catchUpWindowMs: 60_000,
        }),
    ).toThrow(RangeError);
  });
});

describe("failure handling", () => {
  it("releases the claim when the enqueue fails, so a later tick can retry it", async () => {
    const failing: JobQueue = { enqueue: () => Promise.reject(new Error("queue down")) };
    const scheduler = new Scheduler({
      schedules: [schedule],
      queue: failing,
      claims,
      clock: fixedClock(DUE),
      tickIntervalMs: 1_000,
      catchUpWindowMs: 600_000,
    });
    await scheduler.tick();
    expect(claims.size()).toBe(0);

    await schedulerAt("2026-03-10T03:01:00.000Z").tick();
    expect(queue.calls).toHaveLength(1);
  });

  it("keeps ticking after a schedule throws — one broken schedule does not stop the rest", async () => {
    const exploding: ScheduleClaimStore = {
      claim: () => Promise.reject(new Error("database down")),
      release: () => Promise.resolve(),
    };
    const scheduler = new Scheduler({
      schedules: [schedule],
      queue,
      claims: exploding,
      clock: fixedClock(DUE),
      tickIntervalMs: 1_000,
      catchUpWindowMs: 600_000,
    });
    await expect(scheduler.tick()).resolves.toBeUndefined();
  });

  it("skips a tick that arrives while the previous one is still running", async () => {
    let resolveClaim: (won: boolean) => void = () => {};
    const slow: ScheduleClaimStore = {
      claim: () => new Promise<boolean>((resolve) => (resolveClaim = resolve)),
      release: () => Promise.resolve(),
    };
    const scheduler = new Scheduler({
      schedules: [schedule],
      queue,
      claims: slow,
      clock: fixedClock(DUE),
      tickIntervalMs: 1_000,
      catchUpWindowMs: 600_000,
    });
    const first = scheduler.tick();
    await scheduler.tick();
    resolveClaim(true);
    await first;
    expect(queue.calls).toHaveLength(1);
  });
});

describe("start/stop", () => {
  it("ticks on its interval and stops when told to", async () => {
    vi.useFakeTimers();
    try {
      const clock = advanceableClock(DUE);
      const scheduler = new Scheduler({
        schedules: [schedule],
        queue,
        claims,
        clock,
        tickIntervalMs: 1_000,
        catchUpWindowMs: 600_000,
      });
      scheduler.start();
      scheduler.start(); // idempotent — must not double the rate
      await vi.advanceTimersByTimeAsync(1_000);
      expect(queue.calls).toHaveLength(1);

      scheduler.stop();
      clock.set("2026-03-11T03:00:00.000Z");
      await vi.advanceTimersByTimeAsync(5_000);
      expect(queue.calls).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
