import { describe, it, expect, beforeEach, vi } from "vitest";
import { MODULES, ROLE_CAPABILITIES } from "@destaworks/domain/constants";
import type { TenantContext } from "@destaworks/domain/tenant";

/**
 * Proves the Overview's client strips are computed, not guessed — the cadence mean, the anomaly
 * rule and the per-client counts all run for real against mocked repositories.
 *
 * The cadence figures are the part worth pinning: they are the only numbers on the dashboard
 * derived from the SHAPE of a client's history rather than a count, so a regression in the gap
 * maths would look plausible on screen and be wrong everywhere.
 */

const h = vi.hoisted(() => ({
  candidateRepo: {
    listForClientOverview: vi.fn(),
    groupByStatus: vi.fn(),
    listStaleActive: vi.fn(),
  },
  clientRepo: {
    list: vi.fn(),
    nameMap: async () => {
      const clients = await h.clientRepo.list();
      return new Map(clients.map((c: { id: string; name: string }) => [c.id, c.name]));
    },
  },
  cachedClientNameMap: async () => {
    const clients = await h.clientRepo.list();
    return new Map(clients.map((c: { id: string; name: string }) => [c.id, c.name]));
  },
  clientRulesRepo: { list: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/db/prisma", () => ({ prisma: {} }));
vi.mock("@destaworks/db/repositories/candidate.repository", () => ({
  candidateRepository: h.candidateRepo,
}));
vi.mock("@destaworks/db/repositories/client.repository", () => ({
  clientRepository: h.clientRepo,
  cachedClientNameMap: h.cachedClientNameMap,
}));
vi.mock("@destaworks/db/repositories/client-rules.repository", async () => {
  const actual = await vi.importActual<
    typeof import("@destaworks/db/repositories/client-rules.repository")
  >("@destaworks/db/repositories/client-rules.repository");
  return {
    ...actual,
    clientRulesRepository: h.clientRulesRepo,
    cachedClientRulesList: h.clientRulesRepo.list,
  };
});

import { candidateService } from "./candidate.service";

const viewer: TenantContext = {
  tenantId: "t1",
  membershipId: "u1-m",
  modules: MODULES,
  capabilities: ROLE_CAPABILITIES.Associate,
  user: { id: "u1", email: "u@desta.works", name: "U" },
  role: "Associate",
};

const DAY = 86_400_000;
function daysAgo(n: number) {
  return new Date(Date.now() - n * DAY);
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "c",
    name: "Jane",
    clientId: "cl1",
    status: "NEW_CANDIDATE",
    stageOrder: 0,
    stageEnteredAt: new Date(),
    updatedAt: new Date(),
    track: "Clinical",
    credential: "PMHNP",
    licenseState: "NJ",
    licenseStatus: "Active",
    licenseExpiry: null,
    population: "Adult",
    setting: "Telehealth",
    ...overrides,
  };
}

beforeEach(() => {
  h.candidateRepo.listForClientOverview.mockReset().mockResolvedValue([]);
  h.clientRepo.list.mockReset().mockResolvedValue([
    { id: "cl1", name: "Sterling Institute" },
    { id: "cl2", name: "Contemporary Care" },
  ]);
  h.clientRulesRepo.list.mockReset().mockResolvedValue([]);
});

describe("candidateService.clientOverview — cadence", () => {
  it("averages the gaps between touches and reports days since the last", async () => {
    // Touches 10, 8 and 4 days ago -> gaps of 2 and 4 days -> mean 3.
    h.candidateRepo.listForClientOverview.mockResolvedValue([
      row({ id: "a", updatedAt: daysAgo(10) }),
      row({ id: "b", updatedAt: daysAgo(8) }),
      row({ id: "c", updatedAt: daysAgo(4) }),
    ]);

    const { cadence } = await candidateService.clientOverview(viewer);
    expect(cadence).toHaveLength(1);
    expect(cadence[0]!.avgDays).toBe(3);
    expect(cadence[0]!.daysSinceLast).toBe(4);
  });

  it("ignores gaps of 60 days or more so a dormant spell cannot flatten the mean", async () => {
    // Without the cut-off the 200-day gap would make the mean ~100 and nothing would ever alarm.
    h.candidateRepo.listForClientOverview.mockResolvedValue([
      row({ id: "a", updatedAt: daysAgo(210) }),
      row({ id: "b", updatedAt: daysAgo(10) }),
      row({ id: "c", updatedAt: daysAgo(8) }),
    ]);

    const { cadence } = await candidateService.clientOverview(viewer);
    expect(cadence[0]!.avgDays).toBe(2);
  });

  it("reports a single touch as no measurable rhythm", async () => {
    h.candidateRepo.listForClientOverview.mockResolvedValue([
      row({ id: "a", status: "SUBMITTED_TO_CLIENT", updatedAt: daysAgo(3) }),
    ]);

    const { cadence } = await candidateService.clientOverview(viewer);
    expect(cadence[0]!.avgDays).toBe(0);
    expect(cadence[0]!.daysSinceLast).toBe(3);
  });
});

describe("candidateService.clientOverview — anomaly", () => {
  it("flags a client who has gone quiet past twice their own rhythm with work pending", async () => {
    // Replied daily for a week, then silent for 25 days with a submission outstanding.
    h.candidateRepo.listForClientOverview.mockResolvedValue([
      row({ id: "a", updatedAt: daysAgo(30) }),
      row({ id: "b", updatedAt: daysAgo(29) }),
      row({ id: "c", updatedAt: daysAgo(28) }),
      row({
        id: "waiting",
        name: "Michael Obi",
        status: "SUBMITTED_TO_CLIENT",
        updatedAt: daysAgo(25),
      }),
    ]);

    const { cadence } = await candidateService.clientOverview(viewer);
    expect(cadence[0]!.anomaly).toBe(true);
    expect(cadence[0]!.waitingCandidate).toEqual({ id: "waiting", name: "Michael Obi" });
  });

  it("does not flag a quiet client with nothing pending — that is just a gap between candidates", async () => {
    // Same silence as the anomaly case, but nothing is sitting with them.
    h.candidateRepo.listForClientOverview.mockResolvedValue([
      row({ id: "a", updatedAt: daysAgo(30) }),
      row({ id: "b", updatedAt: daysAgo(29) }),
      row({ id: "c", updatedAt: daysAgo(28) }),
      row({ id: "d", status: "NOT_QUALIFIED", stageOrder: 9, updatedAt: daysAgo(25) }),
    ]);

    const { cadence } = await candidateService.clientOverview(viewer);
    expect(cadence[0]!.anomaly).toBe(false);
    expect(cadence[0]!.waitingCandidate).toBeNull();
  });

  it("never flags inside the floor, however fast the client normally replies", async () => {
    // Mean gap 1 day; 3 days of silence is past 2x the rhythm but inside the 5-day floor.
    h.candidateRepo.listForClientOverview.mockResolvedValue([
      row({ id: "a", updatedAt: daysAgo(6) }),
      row({ id: "b", updatedAt: daysAgo(5) }),
      row({ id: "waiting", status: "SUBMITTED_TO_CLIENT", updatedAt: daysAgo(3) }),
    ]);

    const { cadence } = await candidateService.clientOverview(viewer);
    expect(cadence[0]!.anomaly).toBe(false);
  });

  it("puts anomalies first, then whoever is holding the most", async () => {
    h.candidateRepo.listForClientOverview.mockResolvedValue([
      // cl1: two pending, no anomaly (recent touch).
      row({ id: "a1", clientId: "cl1", status: "SUBMITTED_TO_CLIENT", updatedAt: daysAgo(2) }),
      row({ id: "a2", clientId: "cl1", status: "CLIENT_INTERVIEW", updatedAt: daysAgo(1) }),
      // cl2: one pending, long silent against a tight rhythm -> anomaly.
      row({ id: "b1", clientId: "cl2", updatedAt: daysAgo(30) }),
      row({ id: "b2", clientId: "cl2", updatedAt: daysAgo(29) }),
      row({ id: "b3", clientId: "cl2", updatedAt: daysAgo(28) }),
      row({ id: "b4", clientId: "cl2", status: "SUBMITTED_TO_CLIENT", updatedAt: daysAgo(25) }),
    ]);

    const { cadence } = await candidateService.clientOverview(viewer);
    expect(cadence.map((c) => c.clientName)).toEqual(["Contemporary Care", "Sterling Institute"]);
  });
});

describe("candidateService.clientOverview — the scan", () => {
  it("drops candidates whose client is not in the registry rather than inventing a name", async () => {
    h.candidateRepo.listForClientOverview.mockResolvedValue([
      row({ id: "a", clientId: "cl1", status: "SUBMITTED_TO_CLIENT" }),
      row({ id: "ghost", clientId: "deleted-client", status: "SUBMITTED_TO_CLIENT" }),
    ]);

    const { cadence } = await candidateService.clientOverview(viewer);
    expect(cadence).toHaveLength(1);
    expect(cadence[0]!.clientName).toBe("Sterling Institute");
  });

  it("reads the tenant-scoped projection, never the full candidate table", async () => {
    await candidateService.clientOverview(viewer);
    expect(h.candidateRepo.listForClientOverview).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t1" }),
    );
  });
});

describe("candidateService.clientOverview — top candidates", () => {
  beforeEach(() => {
    h.clientRulesRepo.list.mockResolvedValue([
      { clientId: "cl1", states: ["NJ"], creds: [], pops: [], settings: [], priority: null },
    ]);
  });

  it("ranks by fit, best first", async () => {
    h.candidateRepo.listForClientOverview.mockResolvedValue([
      row({ id: "weak", name: "Weak", licenseState: "CT" }),
      row({ id: "strong", name: "Strong", licenseState: "NJ" }),
    ]);

    const { topCandidates } = await candidateService.clientOverview(viewer);
    expect(topCandidates.map((c) => c.id)).toEqual(["strong", "weak"]);
    expect(topCandidates[0]!.matchPct).toBeGreaterThan(topCandidates[1]!.matchPct);
  });

  it("excludes terminal candidates — a rejection is not a recommendation", async () => {
    h.candidateRepo.listForClientOverview.mockResolvedValue([
      row({ id: "live", licenseState: "NJ" }),
      row({ id: "rejected", status: "CLIENT_REJECTED", stageOrder: 9, licenseState: "NJ" }),
      row({ id: "unqualified", status: "NOT_QUALIFIED", stageOrder: 9, licenseState: "NJ" }),
    ]);

    const { topCandidates } = await candidateService.clientOverview(viewer);
    expect(topCandidates.map((c) => c.id)).toEqual(["live"]);
  });

  it("returns at most five", async () => {
    h.candidateRepo.listForClientOverview.mockResolvedValue(
      Array.from({ length: 9 }, (_, i) => row({ id: `c${i}`, name: `C${i}`, licenseState: "NJ" })),
    );

    const { topCandidates } = await candidateService.clientOverview(viewer);
    expect(topCandidates).toHaveLength(5);
  });

  it("breaks score ties by name so the ranking does not shuffle between reads", async () => {
    h.candidateRepo.listForClientOverview.mockResolvedValue([
      row({ id: "c", name: "Carol", licenseState: "NJ" }),
      row({ id: "a", name: "Alice", licenseState: "NJ" }),
      row({ id: "b", name: "Bob", licenseState: "NJ" }),
    ]);

    const { topCandidates } = await candidateService.clientOverview(viewer);
    expect(topCandidates.map((c) => c.name)).toEqual(["Alice", "Bob", "Carol"]);
  });

  it("carries the stage clock and the client name the row renders", async () => {
    h.candidateRepo.listForClientOverview.mockResolvedValue([
      row({ id: "a", licenseState: "NJ", status: "NEW_CANDIDATE", stageEnteredAt: daysAgo(90) }),
    ]);

    const { topCandidates } = await candidateService.clientOverview(viewer);
    expect(topCandidates[0]!.clientName).toBe("Sterling Institute");
    expect(topCandidates[0]!.daysInStage).toBe(90);
    expect(topCandidates[0]!.isOverdue).toBe(true);
    expect(topCandidates[0]!.statusLabel).toBeTruthy();
  });

  it("omits candidates the client's rules cannot score", async () => {
    h.clientRulesRepo.list.mockResolvedValue([]); // no rules -> nothing is scorable
    h.candidateRepo.listForClientOverview.mockResolvedValue([row({ id: "a", licenseState: "NJ" })]);

    const { topCandidates } = await candidateService.clientOverview(viewer);
    expect(topCandidates).toEqual([]);
  });
});
