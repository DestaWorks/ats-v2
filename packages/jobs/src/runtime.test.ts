import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AppError } from "@destaworks/integrations/http/app-error";
import type { JobDefinition } from "./queue";
import { jobQueue, resetJobQueue, setJobQueue } from "./runtime";

const job: JobDefinition<unknown> = {
  name: "test.noop",
  schema: z.unknown(),
  maxAttempts: 1,
  timeoutMs: 1_000,
};

afterEach(() => resetJobQueue());

describe("the queue seam", () => {
  it("refuses with FEATURE_DISABLED until a driver is installed", async () => {
    await expect(jobQueue.enqueue(job, undefined)).rejects.toMatchObject({
      code: "FEATURE_DISABLED",
    });
    await expect(jobQueue.enqueue(job, undefined)).rejects.toBeInstanceOf(AppError);
  });

  it("delegates to whatever driver was installed", async () => {
    const enqueue = vi.fn().mockResolvedValue("job-1");
    setJobQueue({ enqueue });
    await expect(jobQueue.enqueue(job, undefined, { singletonKey: "k" })).resolves.toBe("job-1");
    expect(enqueue).toHaveBeenCalledWith(job, undefined, { singletonKey: "k" });
  });

  it("resolves the driver at call time, so a handle captured at import still works", async () => {
    const captured = jobQueue;
    setJobQueue({ enqueue: () => Promise.resolve("late") });
    await expect(captured.enqueue(job, undefined)).resolves.toBe("late");
  });

  it("goes back to refusing after a reset", async () => {
    setJobQueue({ enqueue: () => Promise.resolve("job-1") });
    resetJobQueue();
    await expect(jobQueue.enqueue(job, undefined)).rejects.toMatchObject({
      code: "FEATURE_DISABLED",
    });
  });
});
