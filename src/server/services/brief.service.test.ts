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
vi.mock("@/server/db/prisma", () => ({ prisma: {}, db: () => ({}) }));
vi.mock("@/server/db/with-transaction", () => ({
  withTransaction: async (fn: (tx: unknown) => unknown) => fn({}),
}));
vi.mock("@/server/db/audit", () => ({ writeAudit: h.writeAudit }));
vi.mock("@/server/repositories/brief.repository", () => ({
  briefRepository: {
    upsertDaily: h.upsertDaily,
    findDailyByDate: h.findDailyByDate,
    upsertWeekly: h.upsertWeekly,
    findWeeklyByWeekStart: h.findWeeklyByWeekStart,
  },
}));
vi.mock("@/server/repositories/user.repository", () => ({
  userRepository: { namesByIds: h.namesByIds, list: vi.fn() },
}));
vi.mock("@/server/repositories/daily.repository", () => ({ dailyRepository: {} }));
vi.mock("@/server/repositories/candidate.repository", () => ({ candidateRepository: {} }));
vi.mock("@/server/repositories/lead.repository", () => ({ leadRepository: {} }));
vi.mock("@/server/repositories/open-role.repository", () => ({ openRoleRepository: {} }));
vi.mock("@/server/repositories/stage-history.repository", () => ({ stageHistoryRepository: {} }));
vi.mock("@/server/repositories/client.repository", () => ({ clientRepository: {} }));

import { briefService } from "./brief.service";

const actor = { id: "u1", email: "o@desta.works", name: "Owner", role: "Owner" as const };

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
    expect(h.upsertDaily).toHaveBeenCalledWith(expect.objectContaining({ date: "2026-07-23" }), {});
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
    expect(await briefService.getDaily("2026-07-23")).toBeNull();
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
    const dto = await briefService.getDaily("2026-07-23");
    expect(dto?.savedByName).toBe("Owner");
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
    expect(await briefService.getWeekly("2026-07-20")).toBeNull();
  });
});
