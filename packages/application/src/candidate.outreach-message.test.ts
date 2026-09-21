import { describe, it, expect, beforeEach, vi } from "vitest";
import { MODULES, ROLE_CAPABILITIES } from "@destaworks/domain/constants";
import type { TenantContext } from "@destaworks/domain/tenant";

/**
 * The templated outreach message, and above all WHO it is addressed to.
 *
 * A NUDGE chases the client for a response; a re-engagement goes to the candidate. Getting that
 * backwards would send a candidate the note written about them, which is the one failure here that
 * is unrecoverable once the send button is pressed.
 */

const h = vi.hoisted(() => ({
  candidateRepo: { findById: vi.fn() },
  clientRepo: { list: vi.fn() },
  clientRulesRepo: { list: vi.fn() },
  userRepo: { findPreferences: vi.fn() },
  contactRepo: { listForClient: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/db/prisma", () => ({ prisma: {} }));
vi.mock("@destaworks/db/repositories/candidate.repository", () => ({
  candidateRepository: h.candidateRepo,
}));
vi.mock("@destaworks/db/repositories/client.repository", () => ({
  clientRepository: h.clientRepo,
}));
vi.mock("@destaworks/db/repositories/user.repository", () => ({ userRepository: h.userRepo }));
vi.mock("@destaworks/db/repositories/client-contact.repository", () => ({
  clientContactRepository: h.contactRepo,
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
  user: { id: "u1", email: "recruiter@desta.works", name: "Leliso Agegnehu" },
  role: "Associate",
};

function candidateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    name: "Michael Obi",
    email: "michael@example.com",
    phone: "+1-555-0100",
    licenseNumber: "LIC-SECRET-9911",
    licenseState: "CA",
    licenseStatus: "Not Verified",
    credential: "PMHNP-BC",
    status: "SUBMITTED_TO_CLIENT",
    stageEnteredAt: new Date(),
    track: "Clinical",
    yearsExp: 6,
    employer: null,
    population: null,
    setting: null,
    telehealthPref: null,
    city: null,
    targetLocation: null,
    licenseExpiry: null,
    clientId: "cl1",
    ...overrides,
  };
}

beforeEach(() => {
  h.candidateRepo.findById.mockReset().mockResolvedValue(candidateRow());
  h.clientRepo.list.mockReset().mockResolvedValue([{ id: "cl1", name: "Sterling Institute" }]);
  h.clientRulesRepo.list.mockReset().mockResolvedValue([]);
  h.userRepo.findPreferences.mockReset().mockResolvedValue({ emailSignature: null });
  h.contactRepo.listForClient
    .mockReset()
    .mockResolvedValue([{ fullName: "Dana Reed", email: "dana@sterling.example" }]);
});

describe("candidateService.outreachMessage — audience", () => {
  it("addresses a NUDGE to the client's contact, not the candidate", async () => {
    const msg = await candidateService.outreachMessage("c1", { type: "NUDGE" }, viewer);

    expect(msg.audience).toBe("client");
    expect(msg.to).toBe("dana@sterling.example");
    expect(msg.to).not.toBe("michael@example.com");
    expect(msg.body).toContain("Dana Reed");
    expect(msg.subject).toContain("Michael Obi");
  });

  it("addresses a re-engagement to the candidate", async () => {
    const msg = await candidateService.outreachMessage("c1", { type: "STALE" }, viewer);

    expect(msg.audience).toBe("candidate");
    expect(msg.to).toBe("michael@example.com");
    expect(msg.body).toContain("Michael Obi");
  });

  it("does not read the client's contact list for a candidate-bound message", async () => {
    await candidateService.outreachMessage("c1", { type: "STALE" }, viewer);
    expect(h.contactRepo.listForClient).not.toHaveBeenCalled();
  });

  it("falls back to the contact TITLE when the client has no contact on file", async () => {
    h.contactRepo.listForClient.mockResolvedValue([]);

    const msg = await candidateService.outreachMessage("c1", { type: "NUDGE" }, viewer);
    expect(msg.to).toBeNull();
    expect(msg.body).toContain("Hiring Manager");
  });
});

describe("candidateService.outreachMessage — composition", () => {
  it("fills the template with the candidate's real details", async () => {
    const msg = await candidateService.outreachMessage("c1", { type: "NUDGE" }, viewer);
    expect(msg.body).toContain("PMHNP-BC");
    expect(msg.body).toContain("Sterling Institute");
    expect(msg.templateId).toBe("clientfollowup");
    expect(msg.templateName).toBeTruthy();
  });

  it("never emits the licence number, whatever the template asks for", async () => {
    const nudge = await candidateService.outreachMessage("c1", { type: "NUDGE" }, viewer);
    const stale = await candidateService.outreachMessage("c1", { type: "STALE" }, viewer);
    expect(`${nudge.subject}${nudge.body}`).not.toContain("LIC-SECRET-9911");
    expect(`${stale.subject}${stale.body}`).not.toContain("LIC-SECRET-9911");
  });

  it("uses the recruiter's signature when they have one", async () => {
    h.userRepo.findPreferences.mockResolvedValue({ emailSignature: "Best,\nLeliso" });
    const msg = await candidateService.outreachMessage("c1", { type: "STALE" }, viewer);
    expect(msg.body.trimEnd().endsWith("Leliso")).toBe(true);
  });

  it("falls back to a default sign-off when no signature is set", async () => {
    const msg = await candidateService.outreachMessage("c1", { type: "STALE" }, viewer);
    expect(msg.body).toContain("DestaHealth Recruiting");
  });

  it("leaves no unresolved token in the finished message", async () => {
    const msg = await candidateService.outreachMessage("c1", { type: "NUDGE" }, viewer);
    expect(msg.subject).not.toMatch(/\{[a-zA-Z]+\}/);
    expect(msg.body).not.toMatch(/\{[a-zA-Z]+\}/);
  });
});

describe("candidateService.outreachMessage — refusals", () => {
  it("refuses to write an email for a verification — that is worked in the app", async () => {
    await expect(
      candidateService.outreachMessage("c1", { type: "VERIFY" }, viewer),
    ).rejects.toThrow();
  });

  it("refuses a candidate outside this workspace", async () => {
    h.candidateRepo.findById.mockResolvedValue(null);
    await expect(
      candidateService.outreachMessage("gone", { type: "NUDGE" }, viewer),
    ).rejects.toThrow();
  });

  it("writes nothing", async () => {
    await candidateService.outreachMessage("c1", { type: "NUDGE" }, viewer);
    expect(h.candidateRepo.findById).toHaveBeenCalledTimes(1);
  });
});
