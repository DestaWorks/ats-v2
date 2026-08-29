import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * `briefService` — Wave 5.1. Covers the deterministic save/get persistence paths (upsert-in-a-
 * transaction + audit + name resolution). The generate/context-assembly paths call the AI layer
 * and a dozen repositories to build context — exercised via the route tests (delegation) and
 * live verification, not re-mocked here (matches this codebase's "ship then harden" bar for
 * AI-feature call sites, `docs/CONVENTIONS.md` §8).
 */

const h = vi.hoisted(() => ({
  upsertDaily: vi.fn(),
  findDailyByDate: vi.fn(),
  upsertWeekly: vi.fn(),
  findWeeklyByWeekStart: vi.fn(),
  namesByIds: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/db/prisma", () => ({ prisma: {}, db: () => ({}) }));
vi.mock("@destaworks/db/with-transaction", () => ({
  withTenantTransaction: async (_ctx: unknown, fn: (tx: unknown) => unknown) => fn({}),
}));
vi.mock("@destaworks/db/audit", () => ({ writeAudit: h.writeAudit }));
vi.mock("@destaworks/db/repositories/brief.repository", () => ({
  briefRepository: {
    upsertDaily: h.upsertDaily,
    findDailyByDate: h.findDailyByDate,
    upsertWeekly: h.upsertWeekly,
    findWeeklyByWeekStart: h.findWeeklyByWeekStart,
  },
}));
vi.mock("@destaworks/db/repositories/user.repository", () => ({
  userRepository: { namesByIds: h.namesByIds, list: vi.fn() },
}));
vi.mock("@destaworks/db/repositories/daily.repository", () => ({ dailyRepository: {} }));
vi.mock("@destaworks/db/repositories/candidate.repository", () => ({ candidateRepository: {} }));
vi.mock("@destaworks/db/repositories/lead.repository", () => ({ leadRepository: {} }));
vi.mock("@destaworks/db/repositories/open-role.repository", () => ({ openRoleRepository: {} }));
vi.mock("@destaworks/db/repositories/stage-history.repository", () => ({
  stageHistoryRepository: {},
}));
vi.mock("@destaworks/db/repositories/client.repository", () => ({ clientRepository: {} }));

import { briefService } from "./brief.service";

const actor = {
  tenantId: "t1",
  membershipId: "u1-m",
  user: { id: "u1", email: "o@desta.works", name: "Owner" },
  role: "Owner" as const,
};

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
});

describe("briefService.saveDaily", () => {
  it("upserts inside a transaction, writes an audit row, and returns the actor as savedByName", async () => {
    h.upsertDaily.mockResolvedValue({
      id: "b1",
      date: "2026-07-23",
      headline: "h",
      exceptions: [],
      yesterdayCheck: [],
      clientCards: [],
      perAssociate: [],
      teamPulse: "p",
      priorityClientId: null,
      shiftA: null,
      shiftB: null,
      watchItems: null,
      savedById: "u1",
      savedAt: new Date("2026-07-23T12:00:00Z"),
    });
    const dto = await briefService.saveDaily(
      {
        date: "2026-07-23",
        headline: "h",
        exceptions: [],
        yesterdayCheck: [],
        clientCards: [],
        perAssociate: [],
        teamPulse: "p",
      },
      actor,
    );
    expect(h.upsertDaily).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ date: "2026-07-23" }),
      {},
    );
    expect(h.writeAudit).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ entity: "daily_brief", action: "save_daily_brief" }),
    );
    expect(dto.savedByName).toBe("Owner");
    expect(dto.headline).toBe("h");
  });
});

describe("briefService.getDaily", () => {
  it("returns null when nothing is saved for the date", async () => {
    h.findDailyByDate.mockResolvedValue(null);
    expect(await briefService.getDaily("2026-07-23", actor)).toBeNull();
  });

  it("resolves savedByName via userRepository.namesByIds when a row exists", async () => {
    h.findDailyByDate.mockResolvedValue({
      date: "2026-07-23",
      headline: "h",
      exceptions: [],
      yesterdayCheck: [],
      clientCards: [],
      perAssociate: [],
      teamPulse: "",
      priorityClientId: null,
      shiftA: null,
      shiftB: null,
      watchItems: null,
      savedById: "u1",
      savedAt: new Date("2026-07-23T12:00:00Z"),
    });
    h.namesByIds.mockResolvedValue(new Map([["u1", "Owner"]]));
    const dto = await briefService.getDaily("2026-07-23", actor);
    expect(dto?.savedByName).toBe("Owner");
    expect(h.findDailyByDate).toHaveBeenCalledWith(actor, "2026-07-23");
    // `User` is global — one human across every tenant — so this lookup takes no scope.
    expect(h.namesByIds).toHaveBeenCalledWith(["u1"]);
  });
});

describe("briefService.saveWeekly", () => {
  it("normalizes weekStart to its Monday and writes an audit row", async () => {
    h.upsertWeekly.mockResolvedValue({
      id: "w1",
      weekStart: "2026-07-20",
      headline: "h",
      kpiNarrative: "",
      clientCards: [],
      perAssociate: [],
      lastWeekCheck: [],
      decisions: [],
      highlights: "",
      blockers: "",
      savedById: "u1",
      savedAt: new Date("2026-07-23T12:00:00Z"),
    });
    const dto = await briefService.saveWeekly(
      {
        weekStart: "2026-07-22", // a Wednesday — should normalize to Monday 2026-07-20
        headline: "h",
        kpiNarrative: "",
        clientCards: [],
        perAssociate: [],
        lastWeekCheck: [],
        decisions: [],
        highlights: "",
        blockers: "",
      },
      actor,
    );
    expect(h.upsertWeekly).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ weekStart: "2026-07-20" }),
      {},
    );
    expect(h.writeAudit).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ entity: "weekly_brief", action: "save_weekly_brief" }),
    );
    expect(dto.weekStart).toBe("2026-07-20");
  });
});

describe("briefService.getWeekly", () => {
  it("returns null when nothing is saved for the week", async () => {
    h.findWeeklyByWeekStart.mockResolvedValue(null);
    expect(await briefService.getWeekly("2026-07-20", actor)).toBeNull();
  });
});
