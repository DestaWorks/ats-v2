import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AuthUser } from "@/server/auth/guards";

/**
 * Proves `candidateService.listCandidates` builds the PII-gated `/candidates` browse list WITHOUT a
 * DB: rows carry NO `licenseNumber` (the projection runs through `toCandidateDTO`, even for a viewer
 * WITH `viewCredentials`), the read is CAPPED at 100 rows via the repository `take` (and `capped`
 * flips when the ceiling is hit), `clientName` resolves from the batch-loaded client map, and the
 * caller's filters are forwarded verbatim. We mock the two repositories; the DTO + timing run for real.
 */

const h = vi.hoisted(() => ({
  candidateRepo: { list: vi.fn() },
  clientRepo: { list: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/repositories/candidate.repository", () => ({
  candidateRepository: h.candidateRepo,
}));
vi.mock("@/server/repositories/client.repository", () => ({
  clientRepository: h.clientRepo,
}));

import { candidateService } from "./candidate.service";

const associate: AuthUser = { id: "u1", email: "u@desta.works", name: "U", role: "Associate" };
const owner: AuthUser = { id: "o1", email: "o@desta.works", name: "O", role: "Owner" };

const DAY = 86_400_000;

/** A candidate row with the fields the list DTO + timing read (incl. sensitive `licenseNumber`). */
function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "c",
    name: "Jane",
    track: "Clinical",
    credential: "PMHNP",
    licenseState: "NJ",
    licenseNumber: "SECRET-123",
    licenseStatus: "Active",
    population: "Adult",
    setting: "Telehealth",
    clientId: null,
    status: "NEW_CANDIDATE",
    stageOrder: 0,
    stageEnteredAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  h.candidateRepo.list.mockReset();
  h.clientRepo.list.mockReset();
  h.clientRepo.list.mockResolvedValue([{ id: "cl1", name: "Sterling Institute" }]);
});

describe("candidateService.listCandidates", () => {
  it("maps rows to PII-gated list items (never licenseNumber, even WITH viewCredentials)", async () => {
    h.candidateRepo.list.mockResolvedValue([
      row({ id: "a", clientId: "cl1", stageEnteredAt: new Date(Date.now() - 5 * DAY) }),
    ]);
    // Owner HAS viewCredentials — the row still structurally omits licenseNumber.
    const list = await candidateService.listCandidates({}, owner);
    expect(list.candidates).toHaveLength(1);
    const item = list.candidates[0]!;
    expect(item).not.toHaveProperty("licenseNumber");
    expect(item.statusLabel).toBe("New Candidate");
    expect(item.clientName).toBe("Sterling Institute");
    expect(item.daysInStage).toBe(5);
  });

  it("resolves clientName to null when the candidate has no client", async () => {
    h.candidateRepo.list.mockResolvedValue([row({ id: "b", clientId: null })]);
    const list = await candidateService.listCandidates({}, associate);
    expect(list.candidates[0]!.clientName).toBeNull();
  });

  it("caps the read at 100 rows via the repository `take` and forwards filters verbatim", async () => {
    h.candidateRepo.list.mockResolvedValue([row()]);
    await candidateService.listCandidates(
      { track: "Operations", status: "NEW_CANDIDATE", clientId: "cl1", search: "jane" },
      associate,
    );
    expect(h.candidateRepo.list).toHaveBeenCalledWith({
      track: "Operations",
      status: "NEW_CANDIDATE",
      clientId: "cl1",
      search: "jane",
      take: 100,
    });
  });

  it("reports capped=false below the cap and capped=true at the ceiling", async () => {
    h.candidateRepo.list.mockResolvedValueOnce([row(), row()]);
    const under = await candidateService.listCandidates({}, associate);
    expect(under.count).toBe(2);
    expect(under.capped).toBe(false);

    h.candidateRepo.list.mockResolvedValueOnce(
      Array.from({ length: 100 }, (_, i) => row({ id: `c${i}` })),
    );
    const full = await candidateService.listCandidates({}, associate);
    expect(full.count).toBe(100);
    expect(full.capped).toBe(true);
  });
});
