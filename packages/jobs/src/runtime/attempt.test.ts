import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AppError } from "@destaworks/integrations/http/app-error";
import { defineJob } from "../registry";
import type { JobDefinition } from "../queue";
import { runAttempt } from "./attempt";

const payloadSchema = z.object({ candidateId: z.string() }).strict();

function definition(overrides: Partial<JobDefinition<{ candidateId: string }>> = {}) {
  return {
    name: "test.job",
    schema: payloadSchema,
    maxAttempts: 3,
    timeoutMs: 50,
    ...overrides,
  } satisfies JobDefinition<{ candidateId: string }>;
}

function input(overrides: Partial<Parameters<typeof runAttempt>[1]> = {}) {
  return {
    jobId: "job_1",
    rawPayload: { candidateId: "cand_1" },
    attempt: 1,
    reportProgress: () => Promise.resolve(),
    ...overrides,
  };
}

describe("runAttempt", () => {
  it("validates the payload against the definition's schema before the handler sees it", async () => {
    const handler = vi.fn(() => Promise.resolve());
    const job = defineJob(definition(), handler);

    const outcome = await runAttempt(job, input({ rawPayload: { candidateId: 42 } }));

    expect(handler).not.toHaveBeenCalled();
    // A payload that fails its schema will fail it on every retry, so the budget is skipped.
    expect(outcome.status).toBe("deadletter");
    expect(outcome.output).toMatchObject({ code: "BAD_REQUEST", permanent: true });
  });

  it("passes the parsed payload, the attempt number and a signal to the handler", async () => {
    const seen: { payload: unknown; attempt: number; aborted: boolean }[] = [];
    const job = defineJob(definition(), (ctx) => {
      seen.push({ payload: ctx.payload, attempt: ctx.attempt, aborted: ctx.signal.aborted });
      return Promise.resolve();
    });

    const outcome = await runAttempt(job, input({ attempt: 2 }));

    expect(outcome).toEqual({ status: "completed", output: undefined });
    expect(seen).toEqual([{ payload: { candidateId: "cand_1" }, attempt: 2, aborted: false }]);
  });

  it("aborts the handler's signal when the deadline passes", async () => {
    let abortedDuringRun = false;
    const job = defineJob(definition({ timeoutMs: 20 }), async (ctx) => {
      await new Promise<void>((resolve) => {
        ctx.signal.addEventListener("abort", () => {
          abortedDuringRun = true;
          resolve();
        });
      });
      // Keep running after the abort: a handler that ignores its signal must still not hold the
      // worker, which is what the race in `runAttempt` exists to guarantee.
      await new Promise((resolve) => setTimeout(resolve, 500));
    });

    const outcome = await runAttempt(job, input());

    expect(abortedDuringRun).toBe(true);
    // Retryable, not dead-lettered: a timeout is the world being slow, not the world saying no.
    expect(outcome.status).toBe("failed");
    expect(outcome.output).toMatchObject({ code: "INTERNAL", permanent: false });
  });

  it("returns from the deadline without waiting for a handler that ignores it", async () => {
    const job = defineJob(definition({ timeoutMs: 20 }), async () => {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    });

    const startedAt = Date.now();
    const outcome = await runAttempt(job, input());

    expect(outcome.status).toBe("failed");
    expect(Date.now() - startedAt).toBeLessThan(1_000);
  });

  it("also aborts when the queue's own signal fires first", async () => {
    const queueAbort = new AbortController();
    const job = defineJob(definition({ timeoutMs: 5_000 }), async (ctx) => {
      await new Promise((resolve) => ctx.signal.addEventListener("abort", resolve));
      throw new AppError("INTERNAL", "aborted by the queue");
    });

    const running = runAttempt(job, input({ queueSignal: queueAbort.signal }));
    queueAbort.abort(new AppError("INTERNAL", "queue expired the job"));

    expect((await running).status).toBe("failed");
  });

  it("dead-letters a permanent failure immediately, without spending the retry budget", async () => {
    const job = defineJob(definition(), () => {
      return Promise.reject(new AppError("NOT_FOUND", "Candidate not found."));
    });

    const outcome = await runAttempt(job, input({ attempt: 1 }));

    expect(outcome.status).toBe("deadletter");
    expect(outcome.output).toMatchObject({ code: "NOT_FOUND", attempt: 1, permanent: true });
  });

  it("retries a transient failure while attempts remain, and stops at maxAttempts", async () => {
    const job = defineJob(definition({ maxAttempts: 3 }), () => {
      return Promise.reject(new AppError("UPSTREAM_ERROR", "The provider is down."));
    });

    const first = await runAttempt(job, input({ attempt: 1 }));
    const last = await runAttempt(job, input({ attempt: 3 }));

    // Both report `failed`; the queue is what counts the budget and dead-letters at the end of it,
    // so the runner never reports `deadletter` for an error that could have succeeded.
    expect(first.status).toBe("failed");
    expect(last.status).toBe("failed");
    expect(last.output).toMatchObject({ code: "UPSTREAM_ERROR", attempt: 3, permanent: false });
  });

  it("keeps a non-AppError message out of what is stored on the job", async () => {
    const job = defineJob(definition(), () => {
      return Promise.reject(new Error("Unique constraint failed on email a.bekele@example.com"));
    });

    const outcome = await runAttempt(job, input());

    expect(outcome.status).toBe("failed");
    expect(outcome.output).toEqual({ code: "INTERNAL", attempt: 1, permanent: false });
    expect(JSON.stringify(outcome.output)).not.toContain("example.com");
  });
});
