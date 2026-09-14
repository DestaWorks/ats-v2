import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AppError } from "@destaworks/integrations/http/app-error";
import type { JobDefinition } from "../queue";
import { defineJob } from "../registry";
import { PgBossJobQueue } from "./pg-boss-queue";
import { JobWorker } from "./worker";
import { FakeBoss } from "./testing/fake-boss";

const schema = z.object({ candidateId: z.string() }).strict();

function definition(overrides: Partial<JobDefinition<{ candidateId: string }>> = {}) {
  return {
    name: "brief.generate",
    schema,
    maxAttempts: 3,
    timeoutMs: 1_000,
    ...overrides,
  } satisfies JobDefinition<{ candidateId: string }>;
}

/** Enqueue one job and run the queue to a standstill, at most `rounds` deliveries. */
async function drain(boss: FakeBoss, rounds: number): Promise<void> {
  for (let round = 0; round < rounds; round++) {
    if ((await boss.deliver("brief.generate")) === 0) return;
  }
}

describe("JobWorker", () => {
  let boss: FakeBoss;

  beforeEach(() => {
    boss = new FakeBoss();
  });

  async function enqueueOne(job: JobDefinition<{ candidateId: string }>): Promise<void> {
    const queue = new PgBossJobQueue({ boss: () => boss, jobs: [] });
    await queue.enqueue(job, { candidateId: "cand_1" });
  }

  it("runs a job's handler with the validated payload and removes it when it succeeds", async () => {
    const seen: unknown[] = [];
    const worker = new JobWorker({
      boss,
      jobs: [
        defineJob(definition(), (ctx) => {
          seen.push(ctx.payload);
          return Promise.resolve();
        }),
      ],
    });
    await worker.start();
    await enqueueOne(definition());

    await drain(boss, 3);

    expect(seen).toEqual([{ candidateId: "cand_1" }]);
    expect(boss.jobs).toEqual([]);
  });

  it("bounds retries at maxAttempts and then dead-letters", async () => {
    const handler = vi.fn(() => Promise.reject(new AppError("UPSTREAM_ERROR", "provider down")));
    const worker = new JobWorker({
      boss,
      jobs: [defineJob(definition({ maxAttempts: 3 }), handler)],
    });
    await worker.start();
    await enqueueOne(definition({ maxAttempts: 3 }));

    await drain(boss, 10);

    // Three attempts, not four and not forever.
    expect(handler).toHaveBeenCalledTimes(3);
    expect(boss.deadLettered("brief.generate")).toHaveLength(1);
    expect(boss.jobs.filter((job) => job.queue === "brief.generate")).toEqual([]);
  });

  it("counts attempts from the queue's retry count, so the handler sees the real number", async () => {
    const attempts: number[] = [];
    const worker = new JobWorker({
      boss,
      jobs: [
        defineJob(definition({ maxAttempts: 3 }), (ctx) => {
          attempts.push(ctx.attempt);
          return Promise.reject(new AppError("UPSTREAM_ERROR", "provider down"));
        }),
      ],
    });
    await worker.start();
    await enqueueOne(definition({ maxAttempts: 3 }));

    await drain(boss, 10);

    expect(attempts).toEqual([1, 2, 3]);
  });

  it("dead-letters a permanent failure on the first attempt, sparing the retry budget", async () => {
    const handler = vi.fn(() => Promise.reject(new AppError("NOT_FOUND", "Candidate not found.")));
    const worker = new JobWorker({
      boss,
      jobs: [defineJob(definition({ maxAttempts: 3 }), handler)],
    });
    await worker.start();
    await enqueueOne(definition({ maxAttempts: 3 }));

    await drain(boss, 10);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(boss.deadLettered("brief.generate")).toHaveLength(1);
  });

  it("dead-letters a payload that does not match its schema without ever calling the handler", async () => {
    const handler = vi.fn(() => Promise.resolve());
    const worker = new JobWorker({ boss, jobs: [defineJob(definition(), handler)] });
    await worker.start();
    // A job enqueued by an older deploy, whose payload the current schema rejects.
    boss.jobs.push({
      id: "job_stale",
      queue: "brief.generate",
      data: { legacyId: 7 },
      retryCount: 0,
    });

    await drain(boss, 10);

    expect(handler).not.toHaveBeenCalled();
    expect(boss.deadLettered("brief.generate")).toHaveLength(1);
  });

  it("aborts a handler that overruns its deadline and retries it", async () => {
    const started: number[] = [];
    const worker = new JobWorker({
      boss,
      jobs: [
        defineJob(definition({ maxAttempts: 2, timeoutMs: 20 }), async (ctx) => {
          started.push(ctx.attempt);
          await new Promise((resolve) => setTimeout(resolve, 5_000));
        }),
      ],
    });
    await worker.start();
    await enqueueOne(definition({ maxAttempts: 2, timeoutMs: 20 }));

    await drain(boss, 10);

    // A timeout is transient, so it spends the budget rather than dead-lettering immediately.
    expect(started).toEqual([1, 2]);
    expect(boss.deadLettered("brief.generate")).toHaveLength(1);
  });

  it("stops the queue gracefully so in-flight jobs are allowed to finish", async () => {
    const worker = new JobWorker({
      boss,
      jobs: [defineJob(definition(), () => Promise.resolve())],
    });
    await worker.start();

    await worker.stop();

    expect(boss.stopped).toBe(true);
  });
});
