import { describe, it, expect, vi } from "vitest";
import { fixedClock } from "@destaworks/domain/clock";
import { effectiveLicenseStatus } from "@destaworks/domain/rules/license";

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
vi.mock("@destaworks/db/repositories/license-verify.repository", () => ({
  licenseVerifyRepository: h.licenseVerifyRepo,
}));
vi.mock("@destaworks/db/repositories/client.repository", () => ({
  clientRepository: h.clientRepo,
}));
vi.mock("@destaworks/integrations/http/request-cache", () => ({
  cachedClientNameMap: h.clientRepo.nameMap,
}));

import { licenseVerifyService } from "./license-verify.service";

const NOW = fixedClock("2026-07-16T00:00:00Z");

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

  it("REGRESSION: daysLeft was off by one — it read EXPIRED on a license still valid today", async () => {
    // Mid-afternoon, not the midnight the old test happened to pin, which hid the bug.
    const clock = fixedClock("2026-07-16T14:00:00Z");
    h.licenseVerifyRepo.verificationQueue.mockResolvedValue({ rows: [], hasMore: false });
    h.licenseVerifyRepo.expiryTimeline.mockResolvedValue([
      // `licenseExpiry` is date-only at UTC midnight; a license is valid THROUGH its expiry date
      // (`lib/rules/license.ts`), so today's expiry is still Active — daysLeft must be 0, not -1.
      candidateRow({ id: "today", licenseExpiry: new Date("2026-07-16T00:00:00Z") }),
      candidateRow({ id: "tomorrow", licenseExpiry: new Date("2026-07-17T00:00:00Z") }),
      candidateRow({ id: "yesterday", licenseExpiry: new Date("2026-07-15T00:00:00Z") }),
    ]);
    h.clientRepo.nameMap.mockResolvedValue(new Map());

    const out = await licenseVerifyService.dashboard(clock);
    const byId = new Map(out.timeline.map((r) => [r.id, r.daysLeft]));
    // OLD: floor((expiry - now)/86_400_000) → -1 / 0 / -2 respectively.
    expect(byId.get("today")).toBe(0);
    expect(byId.get("tomorrow")).toBe(1);
    expect(byId.get("yesterday")).toBe(-1);
    // The sign agrees with `effectiveLicenseStatus`: expired IFF daysLeft < 0.
    expect(
      effectiveLicenseStatus(
        {
          status: "NEW_CANDIDATE",
          track: "Clinical",
          licenseStatus: "Active",
          licenseExpiry: new Date("2026-07-16"),
        },
        clock.now(),
      ),
    ).toBe("Active");
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
