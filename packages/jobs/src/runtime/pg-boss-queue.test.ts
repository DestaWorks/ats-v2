import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AppError } from "@destaworks/integrations/http/app-error";
import type { JobDefinition } from "../queue";
import { defineJob } from "../registry";
import { PgBossJobQueue, deadLetterQueueName, queueOptionsFor } from "./pg-boss-queue";
import { JobWorker } from "./worker";
import { FakeBoss, FakeTransaction } from "./testing/fake-boss";

const schema = z.object({ candidateId: z.string() }).strict();

const briefJob: JobDefinition<{ candidateId: string }> = {
  name: "brief.generate",
  schema,
  maxAttempts: 3,
  timeoutMs: 30_000,
};

describe("PgBossJobQueue", () => {
  let boss: FakeBoss;
  let handler: ReturnType<typeof vi.fn>;
  let queue: PgBossJobQueue;

  beforeEach(() => {
    boss = new FakeBoss();
    handler = vi.fn(() => Promise.resolve());
    queue = new PgBossJobQueue({ boss: () => boss, jobs: [defineJob(briefJob, handler)] });
  });

  it("provisions the queue and its dead-letter queue from the definition", async () => {
    await queue.enqueue(briefJob, { candidateId: "cand_1" });

    expect([...boss.queues.keys()]).toEqual(["brief.generate.dead", "brief.generate"]);
    expect(boss.queues.get("brief.generate")).toMatchObject({
      // maxAttempts 3 is three runs, so two retries.
      retryLimit: 2,
      deadLetter: "brief.generate.dead",
      notify: true,
    });
  });

  it("connects once however many jobs are enqueued", async () => {
    const start = vi.spyOn(boss, "start");
    await queue.enqueue(briefJob, { candidateId: "cand_1" });
    await queue.enqueue(briefJob, { candidateId: "cand_2" });

    expect(start).toHaveBeenCalledTimes(1);
  });

  it("retries the connection after a failed start rather than caching the rejection", async () => {
    const start = vi
      .spyOn(boss, "start")
      .mockRejectedValueOnce(new Error("connection refused"))
      .mockResolvedValue(boss);

    await expect(queue.enqueue(briefJob, { candidateId: "cand_1" })).rejects.toThrow();
    await expect(queue.enqueue(briefJob, { candidateId: "cand_2" })).resolves.toBeDefined();
    expect(start).toHaveBeenCalledTimes(2);
  });

  it("translates the enqueue options onto the send", async () => {
    await queue.enqueue(
      briefJob,
      { candidateId: "cand_1" },
      { startAfterMs: 5_000, singletonKey: "cand_1" },
    );

    expect(boss.sends.at(-1)?.options).toMatchObject({ startAfter: 5, singletonKey: "cand_1" });
  });

  it("refuses a payload that is not an object, which pg-boss cannot store", async () => {
    const stringJob: JobDefinition<string> = {
      name: "brief.generate",
      schema: z.string(),
      maxAttempts: 1,
      timeoutMs: 1_000,
    };

    await expect(queue.enqueue(stringJob, "cand_1")).rejects.toBeInstanceOf(AppError);
  });

  it("rejects a `tx` that cannot run the insert, instead of silently sending outside it", async () => {
    await expect(
      queue.enqueue(briefJob, { candidateId: "cand_1" }, { tx: { notAPrismaClient: true } }),
    ).rejects.toBeInstanceOf(AppError);
    expect(boss.jobs).toEqual([]);
  });

  describe("transactional enqueue", () => {
    it("does not send through its own connection when a transaction is supplied", async () => {
      const tx = new FakeTransaction(boss);
      await queue.enqueue(briefJob, { candidateId: "cand_1" }, { tx });

      // The row is not visible yet: the insert is sitting in the caller's uncommitted transaction.
      expect(boss.jobs).toEqual([]);
      expect(boss.sends.at(-1)?.options.db).toBeDefined();
    });

    it("makes the job visible when the mutation that caused it commits", async () => {
      const tx = new FakeTransaction(boss);
      await queue.enqueue(briefJob, { candidateId: "cand_1" }, { tx });
      tx.commit();

      expect(boss.jobs).toMatchObject([
        { queue: "brief.generate", data: { candidateId: "cand_1" } },
      ]);
    });

    /**
     * The proof the phase asks for, driven end to end through the real worker: enqueue inside a
     * transaction, roll it back, and let the worker try to consume. A queue that sent through its
     * own pool would have written a row that survives the rollback, and the handler would run for
     * a mutation that never happened.
     */
    it("never runs the job when the transaction rolls back", async () => {
      const worker = new JobWorker({ boss, jobs: [defineJob(briefJob, handler)] });
      await worker.start();

      const tx = new FakeTransaction(boss);
      await queue.enqueue(briefJob, { candidateId: "cand_1" }, { tx });
      tx.rollback();

      expect(await boss.deliver("brief.generate")).toBe(0);
      expect(boss.jobs).toEqual([]);
      expect(handler).not.toHaveBeenCalled();
    });

    it("runs it exactly once when the same transaction commits instead", async () => {
      const worker = new JobWorker({ boss, jobs: [defineJob(briefJob, handler)] });
      await worker.start();

      const tx = new FakeTransaction(boss);
      await queue.enqueue(briefJob, { candidateId: "cand_1" }, { tx });
      tx.commit();

      expect(await boss.deliver("brief.generate")).toBe(1);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(boss.jobs).toEqual([]);
    });
  });
});

describe("queueOptionsFor", () => {
  it("turns maxAttempts into a retry count, not an attempt count", () => {
    expect(queueOptionsFor({ maxAttempts: 1, timeoutMs: 1_000 }).retryLimit).toBe(0);
    expect(queueOptionsFor({ maxAttempts: 5, timeoutMs: 1_000 }).retryLimit).toBe(4);
  });

  it("never lets the queue expire an attempt before its own deadline", () => {
    // 30s + slack: the runner's AbortSignal must always fire first, or a job would be retried
    // while its handler is still running.
    expect(queueOptionsFor({ maxAttempts: 1, timeoutMs: 30_000 }).expireInSeconds).toBe(31);
    expect(queueOptionsFor({ maxAttempts: 1, timeoutMs: 1 }).expireInSeconds).toBe(2);
  });
});

describe("deadLetterQueueName", () => {
  it("gives each job its own dead-letter queue, so a redrive knows where to put things back", () => {
    expect(deadLetterQueueName("brief.generate")).toBe("brief.generate.dead");
    expect(deadLetterQueueName("export.csv")).toBe("export.csv.dead");
  });
});
