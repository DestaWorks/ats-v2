import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AuthUser } from "@/server/auth/guards";

/**
 * Proves the alerts composite WITHOUT a DB: buckets are requested for the VIEWER's id (never a
 * client-supplied one), rows are projected with status labels + resolved client names, the badge
 * count comes from mentions only, and the whole shape matches `AlertsDTO`.
 */

const h = vi.hoisted(() => ({
  user: { id: "u1", email: "u@desta.works", name: "Test User", role: "Associate" as const },
  candidateRepo: { alertBuckets: vi.fn() },
  clientRepo: { list: vi.fn() },
  mentionService: { listMine: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/repositories/candidate.repository", () => ({
  candidateRepository: h.candidateRepo,
}));
vi.mock("@/server/repositories/client.repository", () => ({ clientRepository: h.clientRepo }));
vi.mock("./mention.service", () => ({ mentionService: h.mentionService }));

import { alertService } from "./alert.service";

const EMPTY_BUCKET = { count: 0, items: [] };

beforeEach(() => {
  h.candidateRepo.alertBuckets.mockReset();
  h.clientRepo.list.mockReset();
  h.mentionService.listMine.mockReset();
  h.clientRepo.list.mockResolvedValue([{ id: "cl1", name: "Acme Health" }]);
  h.mentionService.listMine.mockResolvedValue({ mentions: [], unread: 0 });
  h.candidateRepo.alertBuckets.mockResolvedValue({
    overdue: EMPTY_BUCKET,
    newToReview: EMPTY_BUCKET,
    verificationPending: EMPTY_BUCKET,
  });
});

describe("alertService.forViewer", () => {
  it("scopes the buckets to the SESSION user's id and caps at 5 rows", async () => {
    await alertService.forViewer(h.user as AuthUser);
    expect(h.candidateRepo.alertBuckets).toHaveBeenCalledWith("u1", 5, expect.any(Date));
  });

  it("projects bucket rows with status labels + resolved client names, keeping the true count", async () => {
    h.candidateRepo.alertBuckets.mockResolvedValue({
      overdue: {
        count: 12,
        items: [
          {
            id: "c1",
            name: "Jane Doe",
            status: "DESTA_REVIEW",
            credential: "PMHNP",
            clientId: "cl1",
            licenseState: "NJ",
          },
          {
            id: "c2",
            name: "No Client",
            status: "NEW_CANDIDATE",
            credential: null,
            clientId: null,
            licenseState: null,
          },
        ],
      },
      newToReview: EMPTY_BUCKET,
      verificationPending: EMPTY_BUCKET,
    });

    const out = await alertService.forViewer(h.user as AuthUser);

    expect(out.overdue.count).toBe(12); // true count, not the capped row count
    expect(out.overdue.items).toEqual([
      {
        id: "c1",
        name: "Jane Doe",
        statusLabel: "Desta Review",
        credential: "PMHNP",
        clientName: "Acme Health",
        licenseState: "NJ",
      },
      {
        id: "c2",
        name: "No Client",
        statusLabel: "New Candidate",
        credential: null,
        clientName: null,
        licenseState: null,
      },
    ]);
  });

  it("the badge count comes from mentions ONLY (buckets never contribute)", async () => {
    h.mentionService.listMine.mockResolvedValue({ mentions: [], unread: 4 });
    h.candidateRepo.alertBuckets.mockResolvedValue({
      overdue: { count: 99, items: [] },
      newToReview: EMPTY_BUCKET,
      verificationPending: EMPTY_BUCKET,
    });
    const out = await alertService.forViewer(h.user as AuthUser);
    expect(out.unread).toBe(4);
  });
});
