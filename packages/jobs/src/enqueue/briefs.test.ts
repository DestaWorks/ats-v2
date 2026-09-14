import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { EnqueueOptions, JobDefinition, JobQueue } from "../queue";
import { resetJobQueue, setJobQueue } from "../runtime";
import { enqueueDailyBriefGeneration, enqueueWeeklyBriefGeneration } from "./briefs";

/**
 * A fake queue that actually HONOURS `singletonKey`, because the behaviour under test is the
 * collapsing itself — a fake that merely records the key would pass while the real thing charged
 * twice for one brief. Pending jobs are keyed exactly as the port specifies: enqueuing a key that
 * is already pending is a no-op returning the pending job's id.
 */
class FakeQueue implements JobQueue {
  readonly enqueued: { name: string; payload: unknown; options?: EnqueueOptions }[] = [];
  private readonly pendingBySingleton = new Map<string, string>();
  private nextId = 1;

  enqueue<TDefinition extends JobDefinition<unknown>>(
    definition: TDefinition,
    payload: unknown,
    options?: EnqueueOptions,
  ): Promise<string> {
    const key = options?.singletonKey;
    if (key !== undefined) {
      const pending = this.pendingBySingleton.get(key);
      if (pending !== undefined) return Promise.resolve(pending);
    }
    const id = `job-${this.nextId++}`;
    if (key !== undefined) this.pendingBySingleton.set(key, id);
    this.enqueued.push({ name: definition.name, payload, ...(options && { options }) });
    return Promise.resolve(id);
  }
}

let queue: FakeQueue;

const dailyInput = {
  date: "2026-08-25",
  tz: -180,
  priorityClientId: "c1",
  shiftA: null,
  shiftB: null,
  watchItems: null,
};

const TENANT = "t1";
const OTHER_TENANT = "t2";

beforeEach(() => {
  queue = new FakeQueue();
  setJobQueue(queue);
});

afterEach(() => {
  resetJobQueue();
});

describe("enqueueDailyBriefGeneration", () => {
  it("queues the job and reports its id and name", async () => {
    const result = await enqueueDailyBriefGeneration(dailyInput, TENANT);

    expect(result).toEqual({ jobId: "job-1", job: "briefs.daily.generate" });
    expect(queue.enqueued).toHaveLength(1);
    expect(queue.enqueued[0]).toMatchObject({
      name: "briefs.daily.generate",
      // The tenant is added HERE, from the caller's resolved context — never read off the
      // request body, which is why it is absent from the endpoint's own schema.
      payload: { ...dailyInput, tenantId: TENANT },
      options: { singletonKey: `briefs.daily.generate:${TENANT}:2026-08-25` },
    });
  });

  it("charges for ONE AI run when generate is clicked twice for the same day", async () => {
    const first = await enqueueDailyBriefGeneration(dailyInput, TENANT);
    const second = await enqueueDailyBriefGeneration(
      { ...dailyInput, shiftA: "different note" },
      TENANT,
    );

    expect(second.jobId).toBe(first.jobId);
    expect(queue.enqueued).toHaveLength(1);
  });

  it("still queues a separate job for a different day", async () => {
    await enqueueDailyBriefGeneration(dailyInput, TENANT);
    await enqueueDailyBriefGeneration({ ...dailyInput, date: "2026-08-26" }, TENANT);

    expect(queue.enqueued).toHaveLength(2);
  });

  it("does NOT collapse two tenants asking for the same day onto one brief", async () => {
    const first = await enqueueDailyBriefGeneration(dailyInput, TENANT);
    const second = await enqueueDailyBriefGeneration(dailyInput, OTHER_TENANT);

    expect(second.jobId).not.toBe(first.jobId);
    expect(queue.enqueued).toHaveLength(2);
  });
});

describe("enqueueWeeklyBriefGeneration", () => {
  it("collapses every spelling of one ISO week onto a single job", async () => {
    // Tuesday and Thursday of the week whose Monday is 2026-08-24.
    const first = await enqueueWeeklyBriefGeneration({ weekStart: "2026-08-25", tz: 0 }, TENANT);
    const second = await enqueueWeeklyBriefGeneration({ weekStart: "2026-08-27", tz: 0 }, TENANT);

    expect(second.jobId).toBe(first.jobId);
    expect(queue.enqueued).toHaveLength(1);
    expect(queue.enqueued[0]?.options?.singletonKey).toBe(
      `briefs.weekly.generate:${TENANT}:2026-08-24`,
    );
    expect(queue.enqueued[0]?.payload).toMatchObject({ tenantId: TENANT });
  });

  it("queues a separate job for the following week", async () => {
    await enqueueWeeklyBriefGeneration({ weekStart: "2026-08-24", tz: 0 }, TENANT);
    await enqueueWeeklyBriefGeneration({ weekStart: "2026-08-31", tz: 0 }, TENANT);

    expect(queue.enqueued).toHaveLength(2);
  });

  it("does NOT collapse two tenants asking for the same week", async () => {
    await enqueueWeeklyBriefGeneration({ weekStart: "2026-08-24", tz: 0 }, TENANT);
    await enqueueWeeklyBriefGeneration({ weekStart: "2026-08-24", tz: 0 }, OTHER_TENANT);

    expect(queue.enqueued).toHaveLength(2);
  });
});

describe("the queue handle", () => {
  it("fails as unavailable, not as a crash, when no driver is bound", async () => {
    resetJobQueue();

    // The handle resolves the driver at call time, so an unconfigured process rejects the enqueue
    // rather than throwing when the module is imported — a route answers 503, it does not crash.
    await expect(
      enqueueDailyBriefGeneration({ date: "2026-08-28", tz: 0 }, TENANT),
    ).rejects.toMatchObject({
      code: "FEATURE_DISABLED",
      status: 503,
    });
  });
});
