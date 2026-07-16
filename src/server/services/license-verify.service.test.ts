import { describe, it, expect, vi } from "vitest";

/**
 * Proves `licenseVerifyService.dashboard` calls the queue/timeline reads with the right caps,
 * resolves client names, propagates `hasMore` as `queueTruncated`, and computes the timeline's
 * `daysLeft` correctly against a fixed clock — WITHOUT a DB. `licenseVerifyRepository`/
 * `clientRepository` are mocked; the repository's own scoping (licenseStatus/active-stage
 * filters, ordering, over-fetch-by-one) is Prisma query construction, not re-tested here.
 */

const h = vi.hoisted(() => ({
  licenseVerifyRepo: { verificationQueue: vi.fn(), expiryTimeline: vi.fn() },
  clientRepo: { nameMap: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/repositories/license-verify.repository", () => ({
  licenseVerifyRepository: h.licenseVerifyRepo,
}));
vi.mock("@/server/repositories/client.repository", () => ({ clientRepository: h.clientRepo }));

import { licenseVerifyService } from "./license-verify.service";

const NOW = new Date("2026-07-16T00:00:00Z");

function candidateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    name: "Jane Doe",
    credential: "PMHNP",
    licenseState: "CT",
    licenseStatus: "Not Verified",
    licenseExpiry: null,
    clientId: "cl1",
    ...overrides,
  };
}

describe("licenseVerifyService.dashboard", () => {
  it("reads the queue capped at 100 and the timeline capped at 12, and resolves client names", async () => {
    h.licenseVerifyRepo.verificationQueue.mockResolvedValue({
      rows: [candidateRow()],
      hasMore: false,
    });
    h.licenseVerifyRepo.expiryTimeline.mockResolvedValue([]);
    h.clientRepo.nameMap.mockResolvedValue(new Map([["cl1", "Sterling Institute"]]));

    const out = await licenseVerifyService.dashboard(NOW);

    expect(h.licenseVerifyRepo.verificationQueue).toHaveBeenCalledWith(100);
    expect(h.licenseVerifyRepo.expiryTimeline).toHaveBeenCalledWith(12);
    expect(out.queue).toEqual([
      {
        id: "c1",
        name: "Jane Doe",
        credential: "PMHNP",
        licenseState: "CT",
        clientName: "Sterling Institute",
        licenseStatus: "Not Verified",
      },
    ]);
    expect(out.queueTruncated).toBe(false);
  });

  it("propagates hasMore as queueTruncated", async () => {
    h.licenseVerifyRepo.verificationQueue.mockResolvedValue({
      rows: [candidateRow()],
      hasMore: true,
    });
    h.licenseVerifyRepo.expiryTimeline.mockResolvedValue([]);
    h.clientRepo.nameMap.mockResolvedValue(new Map());

    const out = await licenseVerifyService.dashboard(NOW);
    expect(out.queueTruncated).toBe(true);
  });

  it("computes daysLeft against the given clock, including a negative (expired) value", async () => {
    h.licenseVerifyRepo.verificationQueue.mockResolvedValue({ rows: [], hasMore: false });
    h.licenseVerifyRepo.expiryTimeline.mockResolvedValue([
      candidateRow({
        id: "future",
        licenseStatus: "Active",
        licenseExpiry: new Date("2026-08-15T00:00:00Z"), // 30 days out
      }),
      candidateRow({
        id: "past",
        licenseStatus: "Active",
        licenseExpiry: new Date("2026-07-01T00:00:00Z"), // 15 days ago
      }),
    ]);
    h.clientRepo.nameMap.mockResolvedValue(new Map());

    const out = await licenseVerifyService.dashboard(NOW);
    expect(out.timeline).toEqual([
      expect.objectContaining({ id: "future", daysLeft: 30 }),
      expect.objectContaining({ id: "past", daysLeft: -15 }),
    ]);
  });
});
