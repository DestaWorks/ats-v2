import { describe, it, expect, beforeEach, vi } from "vitest";
import { MODULES, ROLE_CAPABILITIES } from "@destaworks/domain/constants";
import type { TenantContext } from "@destaworks/domain/tenant";

/**
 * The queue's ASSEMBLY — that the service reads the right projection, applies the domain rule to
 * every row, and reports counters over the whole backlog rather than the visible page. The rule
 * itself is proven in `domain/rules/next-actions.test.ts`; this does not re-test it.
 */

const h = vi.hoisted(() => ({
  candidateRepo: { listActiveForActions: vi.fn() },
  clientRepo: { list: vi.fn(), nameMap: async () => new Map() },
  cachedClientNameMap: async () => new Map(),
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
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    name: "Jane Doe",
    status: "NEW_CANDIDATE",
    stageEnteredAt: new Date(),
    track: "Clinical",
    credential: "PMHNP",
    licenseState: "NJ",
    licenseStatus: "Active",
    licenseExpiry: null,
    clientId: "cl1",
    ...overrides,
  };
}

beforeEach(() => {
  h.candidateRepo.listActiveForActions.mockReset().mockResolvedValue([]);
  h.clientRulesRepo.list.mockReset().mockResolvedValue([]);
});

describe("candidateService.nextActions", () => {
  it("reads the tenant-scoped active projection", async () => {
    await candidateService.nextActions(viewer);
    expect(h.candidateRepo.listActiveForActions).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t1" }),
    );
  });

  it("returns an empty queue, with zeroed counters, when nothing is actionable", async () => {
    h.candidateRepo.listActiveForActions.mockResolvedValue([row()]);

    const result = await candidateService.nextActions(viewer);
    expect(result.actions).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.overdue).toBe(0);
    expect(result.verifications).toBe(0);
  });

  it("expands one candidate into every action they warrant", async () => {
    h.candidateRepo.listActiveForActions.mockResolvedValue([
      row({
        status: "QUALIFIED_PRESCREEN",
        stageEnteredAt: daysAgo(41),
        licenseStatus: "Not Verified",
      }),
    ]);

    const result = await candidateService.nextActions(viewer);
    expect(result.actions.map((a) => a.type).sort()).toEqual(["STALE", "VERIFY"]);
    expect(result.total).toBe(2);
  });

  it("counts the whole backlog, not the visible page", async () => {
    // 20 overdue submissions: more actions than the queue shows, so the header must still be
    // truthful about how much work exists. A count that matched the page would hide the backlog.
    h.candidateRepo.listActiveForActions.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) =>
        row({
          id: `c${i}`,
          name: `Cand ${i}`,
          status: "SUBMITTED_TO_CLIENT",
          stageEnteredAt: daysAgo(40 + i),
          licenseExpiry: new Date("2030-01-01"),
        }),
      ),
    );

    const result = await candidateService.nextActions(viewer);
    expect(result.actions.length).toBeLessThan(20);
    expect(result.total).toBe(20);
    expect(result.overdue).toBe(20);
  });

  it("ranks the worst first, so the visible page is the most urgent work", async () => {
    h.candidateRepo.listActiveForActions.mockResolvedValue([
      row({ id: "low", name: "Low", licenseStatus: "Not Verified" }),
      row({
        id: "high",
        name: "High",
        status: "SUBMITTED_TO_CLIENT",
        stageEnteredAt: daysAgo(52),
        licenseExpiry: new Date("2030-01-01"),
      }),
    ]);

    const result = await candidateService.nextActions(viewer);
    expect(result.actions[0]!.candidateName).toBe("High");
    expect(result.actions[0]!.priority).toBe("P1");
  });

  it("skips a row whose status is not a recognised code rather than guessing at it", async () => {
    h.candidateRepo.listActiveForActions.mockResolvedValue([
      row({ id: "junk", status: "3 - Some Legacy Label", stageEnteredAt: daysAgo(90) }),
    ]);

    const result = await candidateService.nextActions(viewer);
    expect(result.actions).toEqual([]);
  });

  it("carries no contact details into the queue — the reason names a state, never a licence number", async () => {
    h.candidateRepo.listActiveForActions.mockResolvedValue([
      row({ licenseStatus: "Not Verified" }),
    ]);

    const result = await candidateService.nextActions(viewer);
    const action = result.actions[0]!;
    expect(Object.keys(action)).not.toContain("email");
    expect(Object.keys(action)).not.toContain("phone");
    expect(Object.keys(action)).not.toContain("licenseNumber");
  });
});
