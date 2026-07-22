import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Proves `templatePerformanceService.overview` groups attempts by template, keeps `sends` counting
 * both recipient types while `responses`/`rate`/`avgDays` are LEAD-ONLY (candidates have no
 * "responded" concept in this app), and resolves display name/category from the `TEMPLATES`
 * constant — WITHOUT a DB.
 */

const h = vi.hoisted(() => ({
  repo: { attemptsWithTemplate: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/repositories/template-performance.repository", () => ({
  templatePerformanceRepository: h.repo,
}));

import { templatePerformanceService } from "./template-performance.service";

function attempt(overrides: Record<string, unknown> = {}) {
  return {
    templateId: "initial",
    channel: "email",
    at: new Date("2026-07-01T00:00:00.000Z"),
    response: null,
    respondedAt: null,
    candidateId: null,
    leadId: "l1",
    ...overrides,
  };
}

beforeEach(() => {
  h.repo.attemptsWithTemplate.mockReset();
});

describe("templatePerformanceService.overview", () => {
  it("returns an empty row set when there are no template-tagged attempts", async () => {
    h.repo.attemptsWithTemplate.mockResolvedValue([]);
    expect(await templatePerformanceService.overview()).toEqual({ rows: [] });
  });

  it("counts sends across BOTH recipient types, resolves name/category from TEMPLATES", async () => {
    h.repo.attemptsWithTemplate.mockResolvedValue([
      attempt({ leadId: "l1", candidateId: null }),
      attempt({ leadId: null, candidateId: "c1" }),
    ]);
    const { rows } = await templatePerformanceService.overview();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      templateId: "initial",
      templateName: "Initial Outreach",
      category: "outreach",
      sends: 2,
      candidateSends: 1,
      leadSends: 1,
    });
  });

  it("computes responses/rate from LEAD attempts only — a candidate-only template has null rate", async () => {
    h.repo.attemptsWithTemplate.mockResolvedValue([
      attempt({ leadId: null, candidateId: "c1", templateId: "present_short" }),
    ]);
    const { rows } = await templatePerformanceService.overview();
    expect(rows[0]).toMatchObject({ leadSends: 0, responses: 0, rate: null, avgDays: null });
  });

  it("rate = responses/leadSends*100, rounded", async () => {
    h.repo.attemptsWithTemplate.mockResolvedValue([
      attempt({ leadId: "l1", response: "hot" }),
      attempt({ leadId: "l2", response: null }),
      attempt({ leadId: "l3", response: "cold" }),
    ]);
    const { rows } = await templatePerformanceService.overview();
    // 2 of 3 leads responded → 66.67% → rounds to 67
    expect(rows[0]).toMatchObject({ leadSends: 3, responses: 2, rate: 67 });
  });

  it("avgDays is the mean whole-day gap between at and respondedAt, only over responded attempts", async () => {
    h.repo.attemptsWithTemplate.mockResolvedValue([
      attempt({
        leadId: "l1",
        response: "hot",
        at: new Date("2026-07-01T00:00:00.000Z"),
        respondedAt: new Date("2026-07-03T00:00:00.000Z"), // 2 days
      }),
      attempt({
        leadId: "l2",
        response: "cold",
        at: new Date("2026-07-01T00:00:00.000Z"),
        respondedAt: new Date("2026-07-05T00:00:00.000Z"), // 4 days
      }),
      attempt({ leadId: "l3", response: null, respondedAt: null }), // excluded — no response
    ]);
    const { rows } = await templatePerformanceService.overview();
    expect(rows[0]!.avgDays).toBe(3); // (2+4)/2
  });

  it("topChannel is the most-used channel across all attempts for the template", async () => {
    h.repo.attemptsWithTemplate.mockResolvedValue([
      attempt({ channel: "email" }),
      attempt({ channel: "email" }),
      attempt({ channel: "phone" }),
    ]);
    const { rows } = await templatePerformanceService.overview();
    expect(rows[0]!.topChannel).toBe("email");
  });

  it("falls back to the raw id/'unknown' category for a templateId no longer in TEMPLATES", async () => {
    h.repo.attemptsWithTemplate.mockResolvedValue([attempt({ templateId: "removed-template" })]);
    const { rows } = await templatePerformanceService.overview();
    expect(rows[0]).toMatchObject({
      templateId: "removed-template",
      templateName: "removed-template",
      category: "unknown",
    });
  });

  it("sorts rows by sends descending", async () => {
    h.repo.attemptsWithTemplate.mockResolvedValue([
      attempt({ templateId: "initial", leadId: "l1" }),
      attempt({ templateId: "followup1", leadId: "l2" }),
      attempt({ templateId: "followup1", leadId: "l3" }),
    ]);
    const { rows } = await templatePerformanceService.overview();
    expect(rows.map((r) => r.templateId)).toEqual(["followup1", "initial"]);
  });
});
