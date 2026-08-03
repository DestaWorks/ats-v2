import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * `analyticsService` — Wave 5.2. Focused on Client Capacity's threshold/tone logic (legacy
 * `index.html:2911-2913`, preserved: red >=80%, orange >=60%, else green) and the "all-time
 * cumulative placements" numerator decision (never period-filtered —
 * `candidateRepository.countStartedByClient` takes only client ids, no date-range args, regardless
 * of what `loadCohort` was asked for; perf audit 2026-08-03 replaced the former per-client
 * `count()` loop with this single grouped query).
 */

const h = vi.hoisted(() => ({
  loadCohort: vi.fn(),
  listClients: vi.fn(),
  countStartedByClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./reports/cohort", () => ({ loadCohort: h.loadCohort }));
vi.mock("@/server/repositories/client.repository", () => ({
  clientRepository: { list: h.listClients },
}));
vi.mock("@/server/repositories/candidate.repository", () => ({
  candidateRepository: { countStartedByClient: h.countStartedByClient },
}));

import { analyticsService } from "./analytics.service";

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.loadCohort.mockResolvedValue({
    candidates: [],
    clientNames: new Map(),
    userNames: new Map(),
    rulesByClient: new Map(),
    capped: false,
  });
});

describe("analyticsService.overview — Client Capacity", () => {
  it("skips clients with no capacity set", async () => {
    h.listClients.mockResolvedValue([{ id: "c1", name: "Acme", capacity: null }]);
    h.countStartedByClient.mockResolvedValue([]);
    const dto = await analyticsService.overview({});
    expect(dto.clientCapacity).toEqual([]);
    expect(h.countStartedByClient).toHaveBeenCalledWith([]);
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

    const dto = await analyticsService.overview({});
    const byId = new Map(dto.clientCapacity.map((c) => [c.clientId, c]));

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

    const dto = await analyticsService.overview({});

    expect(dto.clientCapacity).toMatchObject([{ clientId: "c1", placed: 0, pct: 0 }]);
  });

  it("numerator is an ALL-TIME count — client ids only, no date-range filter", async () => {
    h.listClients.mockResolvedValue([{ id: "c1", name: "Acme", capacity: 5 }]);
    h.countStartedByClient.mockResolvedValue([{ clientId: "c1", _count: { _all: 1 } }]);

    await analyticsService.overview({
      addedFrom: new Date("2026-01-01"),
      addedTo: new Date("2026-01-31"),
    });

    expect(h.countStartedByClient).toHaveBeenCalledWith(["c1"]);
  });
});
