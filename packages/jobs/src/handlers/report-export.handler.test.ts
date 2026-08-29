import { beforeEach, describe, expect, it, vi } from "vitest";
import { fixedClock } from "@destaworks/domain/clock";
import { AppError } from "@destaworks/integrations/http/app-error";
import type { JobContext } from "../queue";
import { createReportExportHandler } from "./report-export.handler";
import type { ReportExportJobPayload } from "../definitions/report-export.job";

const h = vi.hoisted(() => ({ fulfil: vi.fn(), fail: vi.fn() }));

vi.mock("@destaworks/application/reports/report-export.service", () => ({
  reportExportService: { fulfil: h.fulfil, fail: h.fail },
}));

const NOW = "2026-03-10T03:00:00.000Z";

/** A fake `JobContext` — the handler is driven directly, with no driver anywhere in the test. */
function context(overrides?: Partial<JobContext<ReportExportJobPayload>>) {
  const base: JobContext<ReportExportJobPayload> = {
    payload: { exportId: "exp1", filters: { clientId: "c1" } },
    attempt: 1,
    signal: new AbortController().signal,
    reportProgress: () => Promise.resolve(),
  };
  return { ...base, ...overrides };
}

const handler = createReportExportHandler(fixedClock(NOW));

beforeEach(() => {
  h.fulfil.mockReset();
  h.fail.mockReset();
});

describe("report export handler", () => {
  it("fulfils the export with the injected clock, never an ambient one", async () => {
    await handler(context());
    expect(h.fulfil).toHaveBeenCalledWith("exp1", { clientId: "c1" }, new Date(NOW));
  });

  it("rethrows a non-final failure without marking the export dead", async () => {
    h.fulfil.mockRejectedValue(new AppError("UPSTREAM_ERROR", "storage blipped"));
    await expect(handler(context({ attempt: 2 }))).rejects.toThrow(AppError);
    expect(h.fail).not.toHaveBeenCalled();
  });

  it("marks the export failed on the final attempt, recording the code and not the message", async () => {
    h.fulfil.mockRejectedValue(new AppError("UPSTREAM_ERROR", "candidate Jane Doe broke it"));
    await expect(handler(context({ attempt: 3 }))).rejects.toThrow(AppError);
    expect(h.fail).toHaveBeenCalledWith("exp1", "UPSTREAM_ERROR");
  });

  it("records INTERNAL for a failure that is not an AppError", async () => {
    h.fulfil.mockRejectedValue(new Error("boom"));
    await expect(handler(context({ attempt: 3 }))).rejects.toThrow("boom");
    expect(h.fail).toHaveBeenCalledWith("exp1", "INTERNAL");
  });

  it("does not start the cohort query when the deadline has already passed", async () => {
    const aborted = AbortSignal.abort();
    await expect(handler(context({ signal: aborted }))).rejects.toBeDefined();
    expect(h.fulfil).not.toHaveBeenCalled();
  });
});
