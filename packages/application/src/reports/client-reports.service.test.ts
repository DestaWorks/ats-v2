import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * `clientReportsService.clientCapacity` — folded from the standalone Analytics page 2026-08-03
 * (`docs/MODULE-BREAKDOWN.md` §25). Focused on the threshold/tone logic (legacy
 * `index.html:2911-2913`, preserved: red >=80%, orange >=60%, else green) and the "all-time
 * cumulative placements" numerator decision (`countStartedByClient` takes only client ids, no
 * date-range args).
 */

const h = vi.hoisted(() => ({
  listClients: vi.fn(),
  countStartedByClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/db/repositories/client.repository", () => ({
  clientRepository: { list: h.listClients },
}));
vi.mock("@destaworks/db/repositories/candidate.repository", () => ({
  candidateRepository: { countStartedByClient: h.countStartedByClient },
}));
vi.mock("@destaworks/db/repositories/open-role.repository", () => ({ openRoleRepository: {} }));
vi.mock("@destaworks/db/repositories/stage-history.repository", () => ({
  stageHistoryRepository: {},
}));
vi.mock("./cohort", () => ({ loadCohort: vi.fn(), scoreFor: vi.fn() }));

import { clientReportsService } from "./client-reports.service";

beforeEach(() => {
  h.listClients.mockReset();
  h.countStartedByClient.mockReset();
});

const ctx = {
  tenantId: "t1",
  membershipId: "m1",
  role: "Owner" as const,
  user: { id: "u1", email: "u@desta.works", name: "U" },
};

describe("clientReportsService.clientCapacity", () => {
  it("skips clients with no capacity set", async () => {
    h.listClients.mockResolvedValue([{ id: "c1", name: "Acme", capacity: null }]);
    h.countStartedByClient.mockResolvedValue([]);
    const dto = await clientReportsService.clientCapacity(ctx);
    expect(dto.clients).toEqual([]);
    expect(h.countStartedByClient).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: expect.any(String) }),
      [],
    );
  });

  it("tones red at >=80%, orange at >=60%, green below — and flags approachingCapacity only at red", async () => {
    h.listClients.mockResolvedValue([
      { id: "red", name: "Red Co", capacity: 10 },
      { id: "orange", name: "Orange Co", capacity: 10 },
      { id: "green", name: "Green Co", capacity: 10 },
    ]);
    h.countStartedByClient.mockResolvedValue([
      { clientId: "red", _count: { _all: 8 } },
      { clientId: "orange", _count: { _all: 6 } },
      { clientId: "green", _count: { _all: 3 } },
    ]);

    const dto = await clientReportsService.clientCapacity(ctx);
    const byId = new Map(dto.clients.map((c) => [c.clientId, c]));

    expect(byId.get("red")).toMatchObject({ pct: 80, tone: "red", approachingCapacity: true });
    expect(byId.get("orange")).toMatchObject({
      pct: 60,
      tone: "orange",
      approachingCapacity: false,
    });
    expect(byId.get("green")).toMatchObject({ pct: 30, tone: "green", approachingCapacity: false });
  });

  it("a client missing from the grouped result (zero placements) falls back to 0", async () => {
    h.listClients.mockResolvedValue([{ id: "c1", name: "Acme", capacity: 5 }]);
    h.countStartedByClient.mockResolvedValue([]);

    const dto = await clientReportsService.clientCapacity(ctx);

    expect(dto.clients).toMatchObject([{ clientId: "c1", placed: 0, pct: 0 }]);
  });
});
