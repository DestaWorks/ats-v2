import { describe, it, expect, beforeEach, vi } from "vitest";
import { systemContextFor } from "@destaworks/domain/system-context";
import type { JobContext } from "../queue";

const h = vi.hoisted(() => ({
  generateDailyDraft: vi.fn(),
  generateWeeklyDraft: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/application/brief.service", () => ({
  briefService: {
    generateDailyDraft: h.generateDailyDraft,
    generateWeeklyDraft: h.generateWeeklyDraft,
  },
}));

import { generateDailyBriefHandler, generateWeeklyBriefHandler } from "./briefs";
import { generateDailyBriefJob, generateWeeklyBriefJob } from "../definitions/briefs";

/**
 * A handler is driven through a fake `JobContext`, not through a driver: the port is the contract,
 * and a handler that only works under one driver is a handler tied to the driver.
 */
function fakeContext<TPayload>(payload: TPayload, signal: AbortSignal): JobContext<TPayload> {
  return {
    payload,
    attempt: 1,
    signal,
    reportProgress: () => Promise.resolve(),
  };
}

const TENANT = "t1";

beforeEach(() => {
  h.generateDailyDraft.mockReset().mockResolvedValue(undefined);
  h.generateWeeklyDraft.mockReset().mockResolvedValue(undefined);
});

describe("generateDailyBriefHandler", () => {
  it("splits the payload into the window and the manual inputs, and passes the job's signal down", async () => {
    const signal = new AbortController().signal;

    await generateDailyBriefHandler(
      fakeContext(
        {
          date: "2026-08-25",
          tz: -180,
          tenantId: TENANT,
          priorityClientId: "c1",
          shiftA: "A",
          shiftB: null,
          watchItems: null,
        },
        signal,
      ),
    );

    expect(h.generateDailyDraft).toHaveBeenCalledWith(
      { date: "2026-08-25", tz: -180 },
      { priorityClientId: "c1", shiftA: "A", shiftB: null, watchItems: null },
      systemContextFor(TENANT),
      { signal },
    );
  });

  it("rebuilds the scope from the payload's tenant, at the least privileged role", async () => {
    await generateDailyBriefHandler(
      fakeContext(
        {
          date: "2026-08-25",
          tz: 0,
          tenantId: "t2",
          priorityClientId: null,
          shiftA: null,
          shiftB: null,
          watchItems: null,
        },
        new AbortController().signal,
      ),
    );

    // A job holds no session, so the scope exists to SCOPE queries, not to decide anything: the
    // `viewReports` decision was made at the endpoint that enqueued this.
    const scope = h.generateDailyDraft.mock.calls[0]?.[2] as { tenantId: string; role: string };
    expect(scope.tenantId).toBe("t2");
    expect(scope.role).toBe("Associate");
  });

  it("lets the service's failure out, so the job runner can retry or dead-letter it", async () => {
    h.generateDailyDraft.mockRejectedValue(new Error("provider down"));

    await expect(
      generateDailyBriefHandler(
        fakeContext(
          {
            date: "2026-08-25",
            tz: 0,
            tenantId: TENANT,
            priorityClientId: null,
            shiftA: null,
            shiftB: null,
            watchItems: null,
          },
          new AbortController().signal,
        ),
      ),
    ).rejects.toThrow("provider down");
  });
});

describe("generateWeeklyBriefHandler", () => {
  it("passes the payload and the job's signal to the service", async () => {
    const signal = new AbortController().signal;

    await generateWeeklyBriefHandler(
      fakeContext({ weekStart: "2026-08-24", tz: 0, tenantId: TENANT }, signal),
    );

    // The tenant is consumed into the scope, not forwarded as part of the generation input.
    expect(h.generateWeeklyDraft).toHaveBeenCalledWith(
      { weekStart: "2026-08-24", tz: 0 },
      systemContextFor(TENANT),
      { signal },
    );
  });
});

describe("the brief job definitions", () => {
  it("validates on DEQUEUE, so a payload written by an older deploy is still checked", () => {
    expect(generateDailyBriefJob.schema.safeParse({ date: "nope", tz: 0 }).success).toBe(false);
    expect(
      generateDailyBriefJob.schema.safeParse({ date: "2026-08-25", tz: 0, tenantId: "t1" }).success,
    ).toBe(true);
  });

  it("refuses a payload with no tenant — an unscoped brief job must not be runnable", () => {
    expect(generateDailyBriefJob.schema.safeParse({ date: "2026-08-25", tz: 0 }).success).toBe(
      false,
    );
    expect(
      generateWeeklyBriefJob.schema.safeParse({ weekStart: "2026-08-24", tz: 0 }).success,
    ).toBe(false);
  });

  it("gives the AI deadline (120s) room to fire before the job's own ceiling", () => {
    expect(generateDailyBriefJob.timeoutMs).toBeGreaterThan(120_000);
    expect(generateWeeklyBriefJob.timeoutMs).toBeGreaterThan(120_000);
  });

  it("bounds retries — every attempt is a paid LLM call", () => {
    expect(generateDailyBriefJob.maxAttempts).toBe(2);
    expect(generateWeeklyBriefJob.maxAttempts).toBe(2);
  });
});
