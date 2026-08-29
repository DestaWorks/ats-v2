import { describe, it, expect, beforeEach, vi } from "vitest";
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
      { signal },
    );
  });

  it("lets the service's failure out, so the job runner can retry or dead-letter it", async () => {
    h.generateDailyDraft.mockRejectedValue(new Error("provider down"));

    await expect(
      generateDailyBriefHandler(
        fakeContext(
          {
            date: "2026-08-25",
            tz: 0,
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
    const payload = { weekStart: "2026-08-24", tz: 0 };

    await generateWeeklyBriefHandler(fakeContext(payload, signal));

    expect(h.generateWeeklyDraft).toHaveBeenCalledWith(payload, { signal });
  });
});

describe("the brief job definitions", () => {
  it("validates on DEQUEUE, so a payload written by an older deploy is still checked", () => {
    expect(generateDailyBriefJob.schema.safeParse({ date: "nope", tz: 0 }).success).toBe(false);
    expect(generateDailyBriefJob.schema.safeParse({ date: "2026-08-25", tz: 0 }).success).toBe(
      true,
    );
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
