import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Proves `credentialsIntelligenceService.overview` composes stat cards, the coverage matrix
 * (incl. "needed"/gap flagging for combinations with zero candidates), gap-analysis bucket math,
 * and the NLC tracker — WITHOUT a DB. `credentialsIntelligenceRepository`/`clientRulesRepository`/
 * `clientRepository` are mocked.
 */

const h = vi.hoisted(() => ({
  repo: {
    statCounts: vi.fn(),
    matrixCounts: vi.fn(),
    gapAnalysisCandidates: vi.fn(),
    nlcCompactHolders: vi.fn(),
  },
  clientRulesRepo: { list: vi.fn() },
  clientRepo: { nameMap: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/repositories/credentials-intelligence.repository", () => ({
  credentialsIntelligenceRepository: h.repo,
}));
vi.mock("@/server/repositories/client-rules.repository", () => ({
  clientRulesRepository: h.clientRulesRepo,
}));
vi.mock("@/server/repositories/client.repository", () => ({ clientRepository: h.clientRepo }));

import { credentialsIntelligenceService } from "./credentials-intelligence.service";

const STATS = {
  total: 15,
  active: 6,
  unverified: 8,
  expired: 1,
  expiringSoon: 2,
  nlcCompact: 1,
};

function rulesRow(overrides: Record<string, unknown> = {}) {
  return {
    clientId: "cl1",
    states: ["CT"],
    creds: ["PMHNP"],
    pops: [],
    settings: [],
    priority: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.repo.statCounts.mockResolvedValue(STATS);
  h.repo.matrixCounts.mockResolvedValue({ totals: [], unverified: [] });
  h.repo.gapAnalysisCandidates.mockResolvedValue([]);
  h.repo.nlcCompactHolders.mockResolvedValue([]);
  h.clientRulesRepo.list.mockResolvedValue([]);
  h.clientRepo.nameMap.mockResolvedValue(new Map());
});

describe("credentialsIntelligenceService.overview", () => {
  it("passes the 6 stat-card counts through unchanged", async () => {
    const out = await credentialsIntelligenceService.overview();
    expect(out.stats).toEqual(STATS);
  });

  it("builds matrix cells from real counts, with the correct unverified sub-count", async () => {
    h.repo.matrixCounts.mockResolvedValue({
      totals: [
        { credential: "PMHNP", licenseState: "CT", _count: { _all: 5 } },
        { credential: "LCSW", licenseState: "NJ", _count: { _all: 2 } },
      ],
      unverified: [{ credential: "PMHNP", licenseState: "CT", _count: { _all: 3 } }],
    });
    const out = await credentialsIntelligenceService.overview();
    expect(out.matrix.credentials).toEqual(["LCSW", "PMHNP"]);
    expect(out.matrix.states).toEqual(["CT", "NJ"]);
    expect(out.matrix.cells).toEqual(
      expect.arrayContaining([
        { credential: "PMHNP", state: "CT", total: 5, unverified: 3, needed: false },
        { credential: "LCSW", state: "NJ", total: 2, unverified: 0, needed: false },
      ]),
    );
  });

  it("flags a zero-count cell as a GAP when a client needs that credential+state combination", async () => {
    h.repo.matrixCounts.mockResolvedValue({ totals: [], unverified: [] });
    h.clientRulesRepo.list.mockResolvedValue([rulesRow({ creds: ["PMHNP"], states: ["CT"] })]);
    const out = await credentialsIntelligenceService.overview();
    expect(out.matrix.cells).toEqual([
      { credential: "PMHNP", state: "CT", total: 0, unverified: 0, needed: true },
    ]);
  });

  it("does NOT flag a zero-count cell no client needs", async () => {
    h.repo.matrixCounts.mockResolvedValue({
      totals: [{ credential: "MD", licenseState: "TX", _count: { _all: 0 } }],
      unverified: [],
    });
    h.clientRulesRepo.list.mockResolvedValue([rulesRow({ creds: ["PMHNP"], states: ["CT"] })]);
    const out = await credentialsIntelligenceService.overview();
    const mdCell = out.matrix.cells.find((c) => c.credential === "MD");
    expect(mdCell?.needed).toBe(false);
  });

  it("computes gap-analysis buckets correctly and flags gap when no one is in pipeline", async () => {
    h.clientRulesRepo.list.mockResolvedValue([
      rulesRow({ clientId: "cl1", creds: ["PMHNP", "LCSW"] }),
    ]);
    h.clientRepo.nameMap.mockResolvedValue(new Map([["cl1", "Sterling Institute"]]));
    h.repo.gapAnalysisCandidates.mockResolvedValue([
      { clientId: "cl1", credential: "PMHNP", stageOrder: 1, licenseStatus: "Not Verified" }, // screening
      { clientId: "cl1", credential: "PMHNP", stageOrder: 4, licenseStatus: "Active" }, // submitted + verified
      { clientId: "cl1", credential: "PMHNP", stageOrder: 8, licenseStatus: "Active" }, // placed + submitted + verified
      // LCSW: no candidates at all → gap
    ]);
    const out = await credentialsIntelligenceService.overview();
    const pmhnp = out.gapAnalysis.find((r) => r.credential === "PMHNP")!;
    expect(pmhnp).toMatchObject({
      clientName: "Sterling Institute",
      inPipeline: 3,
      verified: 2,
      screening: 1,
      submitted: 2,
      placed: 1,
      gap: false,
    });
    const lcsw = out.gapAnalysis.find((r) => r.credential === "LCSW")!;
    expect(lcsw).toMatchObject({ inPipeline: 0, gap: true });
  });

  it("maps NLC holders with a uniform additionalStatesCount", async () => {
    h.repo.nlcCompactHolders.mockResolvedValue([
      { id: "c1", name: "Jane Doe", credential: "PMHNP", licenseState: "CT" },
    ]);
    const out = await credentialsIntelligenceService.overview();
    expect(out.nlcHolders).toEqual([
      {
        id: "c1",
        name: "Jane Doe",
        credential: "PMHNP",
        licenseState: "CT",
        additionalStatesCount: 36, // COMPACT_STATES.length (37) - 1
      },
    ]);
  });
});
