import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  clearMigrationCommitEnqueuer,
  requireMigrationCommitEnqueuer,
} from "@destaworks/application/migration-commit.port";
import type { JobQueue } from "./queue";
import { registerEnqueuePorts } from "./register";
import { REGISTERED_JOBS } from "./registered-jobs";
import { migrationCommitJob } from "./queues/migration-commit.job";

/**
 * The composition seam. What it has to guarantee is that a process cannot end up accepting jobs it
 * has no handler for, or holding handlers nothing can enqueue onto — so both halves come from one
 * call, against the port interface and no driver.
 */

vi.mock("server-only", () => ({}));

beforeEach(() => clearMigrationCommitEnqueuer());

function fakeQueue(): { queue: JobQueue; enqueue: ReturnType<typeof vi.fn> } {
  const enqueue = vi.fn().mockResolvedValue("job-1");
  return { queue: { enqueue }, enqueue };
}

describe("registerEnqueuePorts", () => {
  it("points the application's enqueue port at the given queue", async () => {
    const { queue, enqueue } = fakeQueue();
    registerEnqueuePorts(queue);

    const jobId = await requireMigrationCommitEnqueuer()("run-1", "t1");

    expect(jobId).toBe("job-1");
    expect(enqueue).toHaveBeenCalledWith(
      migrationCommitJob,
      { runId: "run-1", tenantId: "t1" },
      {
        singletonKey: "migration.commit:run-1",
      },
    );
  });

  // The original form of this asserted against a handler table returned from here. That table was
  // a second list of jobs and is gone; the invariant it protected is not. Anything given an
  // enqueue port must also be mountable, or the deployment accepts work it has no worker for.
  it("only wires an enqueue port for a job something can actually run", () => {
    registerEnqueuePorts(fakeQueue().queue);

    expect(REGISTERED_JOBS.map((job) => job.name)).toContain(migrationCommitJob.name);
  });

  it("leaves the port unset until a process actually composes one", () => {
    expect(() => requireMigrationCommitEnqueuer()).toThrow(/not available/i);
  });
});
