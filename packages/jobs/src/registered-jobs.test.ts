import { beforeEach, describe, expect, it, vi } from "vitest";
import { REGISTERED_JOBS as JOBS, jobByName } from "./registered-jobs";

const h = vi.hoisted(() => ({ fulfil: vi.fn(), fail: vi.fn() }));

vi.mock("@destaworks/application/reports/report-export.service", () => ({
  reportExportService: { fulfil: h.fulfil, fail: h.fail },
}));

beforeEach(() => {
  h.fulfil.mockReset();
  h.fail.mockReset();
});

function runContext() {
  return { attempt: 1, signal: new AbortController().signal, reportProgress: async () => {} };
}

describe("the job registry", () => {
  it("registers every job under a unique queue name", () => {
    const names = JOBS.map((job) => job.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("finds the export job by its wire name", () => {
    expect(jobByName("reports.export.candidates")?.maxAttempts).toBe(3);
    expect(jobByName("nope")).toBeUndefined();
  });

  it("validates the payload on DEQUEUE, so a stale message cannot reach the handler", async () => {
    const job = jobByName("reports.export.candidates");
    await expect(job?.run({ exportId: 1 }, runContext())).rejects.toBeDefined();
    expect(h.fulfil).not.toHaveBeenCalled();
  });

  it("hands the handler the parsed payload", async () => {
    const job = jobByName("reports.export.candidates");
    await job?.run({ exportId: "exp1", filters: {} }, runContext());
    expect(h.fulfil).toHaveBeenCalledWith("exp1", {}, expect.any(Date));
  });
});
