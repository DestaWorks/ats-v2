import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  list: vi.fn(),
  namesByIds: vi.fn(),
  clientNameMap: vi.fn(),
  clientRulesList: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/db/repositories/candidate.repository", () => ({
  candidateRepository: { list: h.list },
}));
vi.mock("@destaworks/db/repositories/user.repository", () => ({
  userRepository: { namesByIds: h.namesByIds },
}));
vi.mock("@destaworks/db/repositories/client-rules.repository", () => ({
  toClientRules: vi.fn(() => ({})),
}));
vi.mock("@destaworks/integrations/http/request-cache", () => ({
  cachedClientNameMap: h.clientNameMap,
  cachedClientRulesList: h.clientRulesList,
}));

import { loadCohort, REPORT_ROW_CAP } from "./cohort";

const ctx = {
  tenantId: "t1",
  membershipId: "m1",
  role: "Owner" as const,
  user: { id: "u1", email: "o@desta.works", name: "Owner" },
};

function rows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    createdById: null,
    clientId: null,
  }));
}

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.namesByIds.mockResolvedValue(new Map());
  h.clientNameMap.mockResolvedValue(new Map());
  h.clientRulesList.mockResolvedValue([]);
});

describe("loadCohort truncation", () => {
  it("asks for exactly REPORT_ROW_CAP rows", async () => {
    h.list.mockResolvedValue(rows(5));
    await loadCohort(ctx, {});
    expect(h.list).toHaveBeenCalledWith(ctx, expect.objectContaining({ take: REPORT_ROW_CAP }));
  });

  it("reports capped when the read comes back exactly at the cap", async () => {
    h.list.mockResolvedValue(rows(REPORT_ROW_CAP));
    const cohort = await loadCohort(ctx, {});
    expect(cohort.capped).toBe(true);
  });

  it("does not report capped one row below it", async () => {
    h.list.mockResolvedValue(rows(REPORT_ROW_CAP - 1));
    const cohort = await loadCohort(ctx, {});
    expect(cohort.capped).toBe(false);
  });

  it("does not report capped on an empty cohort", async () => {
    h.list.mockResolvedValue([]);
    const cohort = await loadCohort(ctx, {});
    expect(cohort.capped).toBe(false);
  });
});
