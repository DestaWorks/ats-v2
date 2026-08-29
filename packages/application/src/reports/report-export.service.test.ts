import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@destaworks/integrations/http/app-error";

const h = vi.hoisted(() => ({
  storageEnabled: true,
  create: vi.fn(),
  findById: vi.fn(),
  markReady: vi.fn(),
  markFailed: vi.fn(),
  uploadPrivate: vi.fn(),
  getSignedDownloadUrl: vi.fn(),
  candidatesCsv: vi.fn(),
}));

vi.mock("@destaworks/db/repositories/report-export.repository", () => ({
  reportExportRepository: {
    create: h.create,
    findById: h.findById,
    markReady: h.markReady,
    markFailed: h.markFailed,
  },
}));

// Only the S3 calls and the feature flag are stubbed; the key constructors are pure and come
// through, so the keys asserted below are the real ones.
vi.mock("@destaworks/integrations/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@destaworks/integrations/storage")>()),
  get storageEnabled() {
    return h.storageEnabled;
  },
  uploadPrivate: h.uploadPrivate,
  getSignedDownloadUrl: h.getSignedDownloadUrl,
}));

vi.mock("./export.service", () => ({ exportService: { candidatesCsv: h.candidatesCsv } }));

import { reportExportService } from "./report-export.service";

const NOW = new Date("2026-03-10T03:00:00.000Z");

function row(overrides?: Record<string, unknown>) {
  return {
    id: "exp1",
    requestedById: "u1",
    filters: {},
    status: "pending",
    storageKey: null,
    byteSize: null,
    errorCode: null,
    createdAt: NOW,
    readyAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  h.storageEnabled = true;
  for (const value of Object.values(h)) if (vi.isMockFunction(value)) value.mockReset();
});

describe("request", () => {
  it("refuses when object storage is not configured, rather than queuing undeliverable work", async () => {
    h.storageEnabled = false;
    await expect(reportExportService.request("u1", {})).rejects.toMatchObject({
      code: "FEATURE_DISABLED",
    });
    expect(h.create).not.toHaveBeenCalled();
  });

  it("stores dates as ISO strings, so the filters survive the queue round trip", async () => {
    h.create.mockResolvedValue(row());
    await reportExportService.request("u1", { addedFrom: new Date("2026-01-02T00:00:00Z") });
    expect(h.create).toHaveBeenCalledWith(
      "u1",
      { addedFrom: "2026-01-02T00:00:00.000Z" },
      undefined,
    );
  });
});

describe("get", () => {
  it("refuses an export belonging to someone else, as NOT_FOUND not FORBIDDEN", async () => {
    h.findById.mockResolvedValue(row({ requestedById: "u2", status: "ready", storageKey: "k" }));
    await expect(reportExportService.get("exp1", "u1")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(h.getSignedDownloadUrl).not.toHaveBeenCalled();
  });

  it("returns no download URL while the export is still pending", async () => {
    h.findById.mockResolvedValue(row());
    const dto = await reportExportService.get("exp1", "u1");
    expect(dto.status).toBe("pending");
    expect(dto.downloadUrl).toBeUndefined();
    expect(h.getSignedDownloadUrl).not.toHaveBeenCalled();
  });

  it("mints a short-lived URL once ready, and never a permanent one", async () => {
    h.findById.mockResolvedValue(
      row({ status: "ready", storageKey: "candidates/exp1.csv", byteSize: 42, readyAt: NOW }),
    );
    h.getSignedDownloadUrl.mockResolvedValue("https://storage/signed");
    const dto = await reportExportService.get("exp1", "u1");
    expect(dto).toMatchObject({
      status: "ready",
      downloadUrl: "https://storage/signed",
      expiresInSeconds: 300,
      byteSize: 42,
    });
    expect(h.getSignedDownloadUrl).toHaveBeenCalledWith("exports", "candidates/exp1.csv", 300);
  });

  it("surfaces a failed export with its code, so the poller stops waiting", async () => {
    h.findById.mockResolvedValue(row({ status: "failed", errorCode: "UPSTREAM_ERROR" }));
    const dto = await reportExportService.get("exp1", "u1");
    expect(dto).toMatchObject({ status: "failed", errorCode: "UPSTREAM_ERROR" });
    expect(dto.downloadUrl).toBeUndefined();
  });

  it("throws NOT_FOUND for an id that does not exist", async () => {
    h.findById.mockResolvedValue(null);
    await expect(reportExportService.get("nope", "u1")).rejects.toBeInstanceOf(AppError);
  });
});

describe("fulfil", () => {
  it("builds the CSV with the shared export service and stores it in the private bucket", async () => {
    h.candidatesCsv.mockResolvedValue("Name\nJane\n");
    await reportExportService.fulfil("exp1", { clientId: "c1" }, NOW);
    expect(h.candidatesCsv).toHaveBeenCalledWith({ clientId: "c1" });
    const [bucket, key, bytes, contentType] = h.uploadPrivate.mock.calls[0] ?? [];
    expect(bucket).toBe("exports");
    expect(key).toBe("candidates/exp1.csv");
    expect(contentType).toBe("text/csv; charset=utf-8");
    expect(Buffer.isBuffer(bytes)).toBe(true);
    expect(h.markReady).toHaveBeenCalledWith("exp1", "candidates/exp1.csv", 10, NOW);
  });

  it("re-validates the queued filters instead of trusting them", async () => {
    await expect(
      reportExportService.fulfil("exp1", { addedFrom: "not-a-date" }, NOW),
    ).rejects.toBeDefined();
    expect(h.candidatesCsv).not.toHaveBeenCalled();
  });

  it("re-parses ISO filter dates back into Dates for the cohort query", async () => {
    h.candidatesCsv.mockResolvedValue("Name\n");
    await reportExportService.fulfil("exp1", { addedFrom: "2026-01-02T00:00:00.000Z" }, NOW);
    expect(h.candidatesCsv).toHaveBeenCalledWith({ addedFrom: new Date("2026-01-02T00:00:00Z") });
  });

  it("does not mark the export ready when the upload fails", async () => {
    h.candidatesCsv.mockResolvedValue("Name\n");
    h.uploadPrivate.mockRejectedValue(new AppError("UPSTREAM_ERROR", "no"));
    await expect(reportExportService.fulfil("exp1", {}, NOW)).rejects.toBeInstanceOf(AppError);
    expect(h.markReady).not.toHaveBeenCalled();
  });
});
