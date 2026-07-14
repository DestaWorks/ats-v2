import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AuthUser } from "@/server/auth/guards";

/**
 * Proves the inbound-triage pipeline WITHOUT a DB or a real model call: `extractInbound` is
 * mocked (its own provider-error mapping is covered by `parse-resume.test.ts`'s pattern), and the
 * dedupe/client-match reads + the two save paths (fresh lead / attach) are asserted against the
 * mocked repositories and `leadService`.
 */

const h = vi.hoisted(() => ({
  user: { id: "u1", email: "u@desta.works", name: "Test User", role: "Associate" as const },
  extractInbound: vi.fn(),
  candidateRepo: { findManyByEmails: vi.fn() },
  leadRepo: { findManyByEmails: vi.fn(), findManyByNames: vi.fn() },
  clientRepo: { list: vi.fn() },
  clientRulesRepo: { list: vi.fn() },
  leadService: { create: vi.fn(), logOutreach: vi.fn(), respond: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/ai/extract-inbound", () => ({ extractInbound: h.extractInbound }));
vi.mock("@/server/repositories/candidate.repository", () => ({
  candidateRepository: h.candidateRepo,
}));
vi.mock("@/server/repositories/lead.repository", () => ({ leadRepository: h.leadRepo }));
vi.mock("@/server/repositories/client.repository", () => ({ clientRepository: h.clientRepo }));
vi.mock("@/server/repositories/client-rules.repository", async () => {
  const actual = await vi.importActual<
    typeof import("@/server/repositories/client-rules.repository")
  >("@/server/repositories/client-rules.repository");
  return { clientRulesRepository: h.clientRulesRepo, toClientRules: actual.toClientRules };
});
vi.mock("./lead.service", () => ({ leadService: h.leadService }));

import { inboundService } from "./inbound.service";

/** A minimal extracted DTO — override per test. */
function extracted(overrides: Record<string, unknown> = {}) {
  return {
    name: "Jane Doe",
    email: "jane@example.com",
    phone: "555-0100",
    linkedinUrl: null,
    credential: "PMHNP",
    licenseState: "NJ",
    city: "Newark",
    state: "NJ",
    yearsExp: 5,
    settingPreference: "Telehealth",
    populationPreference: "Adult",
    telehealthPreference: "Telehealth",
    rateExpectation: "$90/hr",
    availability: "Immediately",
    intent: "open_to_opportunity",
    summary: "PMHNP in NJ open to telehealth work.",
    ...overrides,
  };
}

const user = h.user as AuthUser;

beforeEach(() => {
  vi.clearAllMocks();
  h.candidateRepo.findManyByEmails.mockResolvedValue([]);
  h.leadRepo.findManyByEmails.mockResolvedValue([]);
  h.leadRepo.findManyByNames.mockResolvedValue([]);
  h.clientRepo.list.mockResolvedValue([]);
  h.clientRulesRepo.list.mockResolvedValue([]);
});

describe("inboundService.triage", () => {
  it("returns no existing match and no client matches when nothing lines up", async () => {
    h.extractInbound.mockResolvedValue(extracted());
    const result = await inboundService.triage({ messageText: "hi there, im a PMHNP in NJ" });
    expect(result.extracted.name).toBe("Jane Doe");
    expect(result.existing).toBeNull();
    expect(result.clientMatches).toEqual([]);
  });

  it("prefers a CANDIDATE email match over a lead email match", async () => {
    h.extractInbound.mockResolvedValue(extracted());
    h.candidateRepo.findManyByEmails.mockResolvedValue([
      { id: "c1", name: "Jane Doe", email: "jane@example.com" },
    ]);
    h.leadRepo.findManyByEmails.mockResolvedValue([
      { id: "l1", name: "Jane Doe", email: "jane@example.com" },
    ]);
    const result = await inboundService.triage({ messageText: "hi there, im a PMHNP in NJ" });
    expect(result.existing).toEqual({
      kind: "candidate",
      id: "c1",
      name: "Jane Doe",
      matchedOn: "email",
    });
  });

  it("falls back to a LEAD email match when no candidate matches", async () => {
    h.extractInbound.mockResolvedValue(extracted());
    h.leadRepo.findManyByEmails.mockResolvedValue([
      { id: "l1", name: "Jane Doe", email: "jane@example.com" },
    ]);
    const result = await inboundService.triage({ messageText: "hi there, im a PMHNP in NJ" });
    expect(result.existing).toEqual({
      kind: "lead",
      id: "l1",
      name: "Jane Doe",
      matchedOn: "email",
    });
  });

  it("falls back to a NAME match on leads when there is no email", async () => {
    h.extractInbound.mockResolvedValue(extracted({ email: null }));
    h.leadRepo.findManyByNames.mockResolvedValue([{ id: "l2", name: "Jane Doe", email: null }]);
    const result = await inboundService.triage({ messageText: "hi im jane, a PMHNP" });
    expect(result.existing).toEqual({
      kind: "lead",
      id: "l2",
      name: "Jane Doe",
      matchedOn: "name",
    });
    expect(h.leadRepo.findManyByEmails).not.toHaveBeenCalled();
  });

  it("scores + ranks client matches, dropping clients with no positive match reason", async () => {
    h.extractInbound.mockResolvedValue(extracted());
    h.clientRepo.list.mockResolvedValue([
      { id: "cl-fit", name: "Fit Health" },
      { id: "cl-nofit", name: "No Fit Health" },
    ]);
    h.clientRulesRepo.list.mockResolvedValue([
      { clientId: "cl-fit", states: ["NJ"], creds: ["PMHNP"], pops: [], settings: [] },
      { clientId: "cl-nofit", states: ["CA"], creds: ["LCSW"], pops: [], settings: [] },
    ]);
    const result = await inboundService.triage({ messageText: "hi there, im a PMHNP in NJ" });
    expect(result.clientMatches).toHaveLength(1);
    expect(result.clientMatches[0]?.clientId).toBe("cl-fit");
    expect(result.clientMatches[0]?.reasons).toEqual(
      expect.arrayContaining(["Licensed in NJ", "PMHNP is a fit for Fit Health"]),
    );
  });
});

describe("inboundService.saveAsLead", () => {
  it("creates the lead, logs the message as outreach, then marks it Hot", async () => {
    h.leadService.create.mockResolvedValue({ id: "l1", status: "Sourced" });
    h.leadService.logOutreach.mockResolvedValue({ id: "l1", status: "Sourced" });
    h.leadService.respond.mockResolvedValue({ id: "l1", status: "Responded — Hot" });

    const result = await inboundService.saveAsLead(
      { name: "Jane Doe", email: "jane@example.com", message: "I'm interested!" },
      user,
    );

    expect(h.leadService.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Jane Doe", source: "Inbound" }),
      user,
    );
    expect(h.leadService.logOutreach).toHaveBeenCalledWith(
      "l1",
      expect.objectContaining({
        channel: "other",
        note: expect.stringContaining("I'm interested!"),
      }),
      user,
    );
    expect(h.leadService.respond).toHaveBeenCalledWith("l1", "hot", user);
    expect(result.status).toBe("Responded — Hot");
  });

  it("truncates the message to 500 chars in the outreach note", async () => {
    h.leadService.create.mockResolvedValue({ id: "l1", status: "Sourced" });
    h.leadService.logOutreach.mockResolvedValue({ id: "l1", status: "Sourced" });
    h.leadService.respond.mockResolvedValue({ id: "l1", status: "Responded — Hot" });

    const longMessage = "x".repeat(600);
    await inboundService.saveAsLead({ name: "Jane Doe", message: longMessage }, user);

    const note = h.leadService.logOutreach.mock.calls[0]?.[1].note as string;
    expect(note.length).toBeLessThan(520);
    expect(note).toContain("…");
  });
});

describe("inboundService.attach", () => {
  it("logs the message on the existing lead, then marks it Hot", async () => {
    h.leadService.logOutreach.mockResolvedValue({ id: "l1", status: "Sourced" });
    h.leadService.respond.mockResolvedValue({ id: "l1", status: "Responded — Hot" });

    const result = await inboundService.attach({ leadId: "l1", message: "Still interested" }, user);

    expect(h.leadService.logOutreach).toHaveBeenCalledWith(
      "l1",
      expect.objectContaining({
        channel: "other",
        note: expect.stringContaining("Still interested"),
      }),
      user,
    );
    expect(h.leadService.respond).toHaveBeenCalledWith("l1", "hot", user);
    expect(result.status).toBe("Responded — Hot");
  });
});
