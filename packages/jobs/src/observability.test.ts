import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type { JobDefinition } from "./queue";
import { defineJob } from "./registry";
import { inspectJobs, retryDeadLettered } from "./observability";
import { PgBossJobQueue } from "./runtime/pg-boss-queue";
import { FakeBoss } from "./runtime/testing/fake-boss";

const briefJob: JobDefinition<{ candidateId: string }> = {
  name: "brief.generate",
  schema: z.object({ candidateId: z.string() }).strict(),
  maxAttempts: 1,
  timeoutMs: 1_000,
};

const registered = defineJob(briefJob, () => Promise.resolve());

describe("job observability", () => {
  let boss: FakeBoss;
  let queue: PgBossJobQueue;

  beforeEach(async () => {
    boss = new FakeBoss();
    queue = new PgBossJobQueue({ boss: () => boss, jobs: [registered] });
    await queue.start();
  });

  it("reports queued work and dead-lettered work separately", async () => {
    await queue.enqueue(briefJob, { candidateId: "cand_1" });
    await queue.enqueue(briefJob, { candidateId: "cand_2" });
    // One of them gives up.
    const failing = boss.jobs[0];
    if (failing) failing.queue = "brief.generate.dead";

    expect(await inspectJobs(boss, [registered])).toEqual([
      { job: "brief.generate", queued: 1, active: 0, failed: 0, deadLettered: 1 },
    ]);
  });

  it("moves dead-lettered jobs back onto their own queue, bounded by the limit", async () => {
    for (const candidateId of ["cand_1", "cand_2", "cand_3"]) {
      await queue.enqueue(briefJob, { candidateId });
    }
    for (const job of boss.jobs) job.queue = "brief.generate.dead";

    const moved = await retryDeadLettered(boss, registered, 2);

    expect(moved).toBe(2);
    expect(await inspectJobs(boss, [registered])).toEqual([
      { job: "brief.generate", queued: 2, active: 0, failed: 0, deadLettered: 1 },
    ]);
  });

  it("reports zero rather than failing for a queue that has never been created", async () => {
    const unprovisioned = new FakeBoss();

    expect(await inspectJobs(unprovisioned, [registered])).toEqual([
      { job: "brief.generate", queued: 0, active: 0, failed: 0, deadLettered: 0 },
    ]);
  });
});
