import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AuthUser } from "@/server/auth/guards";

/**
 * Proves the Open Roles service's DTO shaping, the matching/triage composition (weight
 * resolution: saved profile vs `DEFAULT_MATCH_WEIGHTS`), the `closedAt` stamp on status
 * transitions, the promote→`filledFromRoleId` wiring, and the leadership gate on match-profile
 * writes — all WITHOUT a DB. The pure `role-matching` rules run for real; repositories,
 * `leadService`, `extractJd`, `writeAudit`, and `withTransaction` are mocked.
 */

const h = vi.hoisted(() => ({
  fakeTx: { __tx: true },
  associate: { id: "u1", email: "u@desta.works", name: "Test User", role: "Associate" as const },
  owner: { id: "o1", email: "o@desta.works", name: "Owner", role: "Owner" as const },
  roleRepo: {
    create: vi.fn(),
    findById: vi.fn(),
    findManyByIds: vi.fn(),
    count: vi.fn(),
    list: vi.fn(),
    listActive: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    createNote: vi.fn(),
    listNotes: vi.fn(),
    softDeleteNote: vi.fn(),
  },
  profileRepo: { findByClientId: vi.fn(), list: vi.fn(), upsert: vi.fn(), delete: vi.fn() },
  clientRepo: {
    list: vi.fn(),
    nameMap: async () => {
      const clients = await h.clientRepo.list();
      return new Map(clients.map((c: { id: string; name: string }) => [c.id, c.name]));
    },
  },
  leadRepo: { list: vi.fn(), listForMatching: vi.fn() },
  userRepo: { namesByIds: vi.fn() },
  leadService: { promote: vi.fn() },
  extractJd: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/repositories/open-role.repository", () => ({ openRoleRepository: h.roleRepo }));
vi.mock("@/server/repositories/client-match-profile.repository", () => ({
  clientMatchProfileRepository: h.profileRepo,
}));
vi.mock("@/server/repositories/client.repository", () => ({ clientRepository: h.clientRepo }));
vi.mock("@/server/repositories/lead.repository", () => ({ leadRepository: h.leadRepo }));
vi.mock("@/server/repositories/user.repository", () => ({ userRepository: h.userRepo }));
vi.mock("./lead.service", () => ({ leadService: h.leadService }));
vi.mock("@/server/ai/extract-jd", () => ({ extractJd: h.extractJd }));
vi.mock("@/server/db/audit", () => ({ writeAudit: h.writeAudit }));
vi.mock("@/server/db/with-transaction", () => ({
  withTransaction: (fn: (tx: unknown) => unknown) => fn(h.fakeTx),
}));

import { openRoleService } from "./open-role.service";

const associate = h.associate as AuthUser;
const owner = h.owner as AuthUser;

/** A role row with the fields the service reads. */
function role(overrides: Record<string, unknown> = {}) {
  return {
    id: "r1",
    legacyId: null,
    clientId: "c1",
    title: "PMHNP — Telehealth",
    credential: "PMHNP",
    state: "NJ",
    city: null,
    setting: "Telehealth",
    population: "Adult",
    rate: "$90/hr",
    description: null,
    status: "Open",
    priority: "P2",
    assignedToId: null,
    openedAt: new Date("2026-07-01T00:00:00Z"),
    closedAt: null,
    createdById: "u1",
    createdAt: new Date("2026-07-01T00:00:00Z"),
    updatedAt: new Date("2026-07-01T00:00:00Z"),
    ...overrides,
  };
}

/** A lead row shaped for the matcher (clientId is the "target client"). */
function lead(overrides: Record<string, unknown> = {}) {
  return {
    id: "l1",
    name: "Jane Doe",
    clientId: "c1",
    state: "NJ",
    credential: "PMHNP",
    status: "Responded — Hot",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.clientRepo.list.mockResolvedValue([{ id: "c1", name: "Sterling Institute" }]);
  h.userRepo.namesByIds.mockResolvedValue(new Map());
  h.roleRepo.listNotes.mockResolvedValue([]);
});

describe("openRoleService.create", () => {
  it("creates the role and returns its detail", async () => {
    h.roleRepo.create.mockResolvedValue(role());
    h.roleRepo.findById.mockResolvedValue(role());
    const detail = await openRoleService.create(
      { clientId: "c1", title: "PMHNP — Telehealth", priority: "P2" },
      associate,
    );
    expect(h.roleRepo.create).toHaveBeenCalled();
    expect(h.writeAudit).toHaveBeenCalledWith(
      h.fakeTx,
      expect.objectContaining({ entity: "open_role", action: "create" }),
    );
    expect(detail.clientName).toBe("Sterling Institute");
  });
});

describe("openRoleService.update — closedAt stamping", () => {
  it("stamps closedAt when a role transitions to Filled", async () => {
    h.roleRepo.findById.mockResolvedValue(role({ status: "Open", closedAt: null }));
    h.roleRepo.update.mockResolvedValue(role({ status: "Filled" }));
    await openRoleService.update("r1", { status: "Filled" }, associate);
    expect(h.roleRepo.update).toHaveBeenCalledWith(
      "r1",
      expect.objectContaining({ status: "Filled", closedAt: expect.any(Date) }),
      h.fakeTx,
    );
  });

  it("clears closedAt when a Filled role is reopened", async () => {
    h.roleRepo.findById.mockResolvedValue(role({ status: "Filled", closedAt: new Date() }));
    h.roleRepo.update.mockResolvedValue(role({ status: "Open" }));
    await openRoleService.update("r1", { status: "Open" }, associate);
    expect(h.roleRepo.update).toHaveBeenCalledWith(
      "r1",
      expect.objectContaining({ status: "Open", closedAt: null }),
      h.fakeTx,
    );
  });

  it("does not touch closedAt for a non-status edit", async () => {
    h.roleRepo.findById.mockResolvedValue(role());
    h.roleRepo.update.mockResolvedValue(role({ title: "Updated" }));
    await openRoleService.update("r1", { title: "Updated" }, associate);
    const data = h.roleRepo.update.mock.calls[0]?.[1];
    expect(data).not.toHaveProperty("closedAt");
  });
});

describe("openRoleService.matches", () => {
  it("uses the client's saved weight profile when one exists", async () => {
    h.roleRepo.findById.mockResolvedValue(role());
    h.profileRepo.findByClientId.mockResolvedValue({
      weightSameClient: 100, // exaggerated so the test can tell it's actually being used
      weightSameState: 0,
      weightCredExact: 0,
      weightCredPartial: 0,
      weightRespondedHot: 0,
      weightOutreach: 0,
      weightSourced: 0,
      penaltyCold: 0,
      minScore: 1,
    });
    h.leadRepo.listForMatching.mockResolvedValue([lead({ status: "Sourced" })]);
    const matches = await openRoleService.matches("r1");
    expect(matches).toHaveLength(1);
    expect(matches[0]?.score).toBe(100); // only the exaggerated same-client weight
  });

  it("falls back to DEFAULT_MATCH_WEIGHTS when the client has no saved profile", async () => {
    h.roleRepo.findById.mockResolvedValue(role());
    h.profileRepo.findByClientId.mockResolvedValue(null);
    h.leadRepo.listForMatching.mockResolvedValue([lead()]); // clientId/state/credential match + Hot
    const matches = await openRoleService.matches("r1");
    expect(matches[0]?.score).toBe(30 + 25 + 25 + 20); // DEFAULT_MATCH_WEIGHTS perfect + hot
  });
});

describe("openRoleService.dormantMatches", () => {
  it("only surfaces cold/no-response/future-collab leads regardless of client profile", async () => {
    h.roleRepo.findById.mockResolvedValue(role());
    h.leadRepo.listForMatching.mockResolvedValue([
      lead({ status: "Responded — Hot" }),
      lead({ id: "l2", status: "No Response" }),
    ]);
    const matches = await openRoleService.dormantMatches("r1");
    expect(matches).toHaveLength(1);
    expect(matches[0]?.leadId).toBe("l2");
  });
});

describe("openRoleService.promote", () => {
  it("delegates to leadService.promote with this role's id as filledFromRoleId", async () => {
    h.roleRepo.findById.mockResolvedValue(role());
    h.leadService.promote.mockResolvedValue({ candidateId: "cand1" });
    const result = await openRoleService.promote("r1", { leadId: "l1" }, associate);
    expect(h.leadService.promote).toHaveBeenCalledWith("l1", associate, { filledFromRoleId: "r1" });
    expect(result).toEqual({ candidateId: "cand1" });
  });
});

describe("openRoleService.deleteNote", () => {
  it("throws NOT_FOUND when the note doesn't exist under this role (0 rows affected)", async () => {
    h.roleRepo.findById.mockResolvedValue(role());
    h.roleRepo.softDeleteNote.mockResolvedValue({ count: 0 });
    await expect(openRoleService.deleteNote("r1", "missing-note", associate)).rejects.toMatchObject(
      {
        code: "NOT_FOUND",
      },
    );
  });

  it("soft-deletes + audits when the note exists", async () => {
    h.roleRepo.findById.mockResolvedValue(role());
    h.roleRepo.softDeleteNote.mockResolvedValue({ count: 1 });
    await openRoleService.deleteNote("r1", "n1", associate);
    expect(h.writeAudit).toHaveBeenCalledWith(
      h.fakeTx,
      expect.objectContaining({ action: "delete_note", after: { noteId: "n1" } }),
    );
  });
});

describe("openRoleService.triage", () => {
  it("ranks active roles, resolving weights per-client, and caps at 3", async () => {
    const roles = ["r1", "r2", "r3", "r4"].map((id, i) =>
      role({ id, priority: i === 0 ? "P1" : "P3", openedAt: new Date("2026-07-01T00:00:00Z") }),
    );
    h.roleRepo.listActive.mockResolvedValue(roles);
    h.profileRepo.list.mockResolvedValue([]);
    h.leadRepo.listForMatching.mockResolvedValue([lead()]);
    const top = await openRoleService.triage();
    expect(top).toHaveLength(3);
    expect(top[0]?.roleId).toBe("r1"); // P1 + hot match dominates the ranking
  });
});

describe("client match profile — leadership gate", () => {
  it("FORBIDDEN for a non-leadership caller on save (no write)", async () => {
    await expect(
      openRoleService.saveMatchProfile(
        "c1",
        {
          weightSameClient: 1,
          weightSameState: 1,
          weightCredExact: 1,
          weightCredPartial: 1,
          weightRespondedHot: 1,
          weightOutreach: 1,
          weightSourced: 1,
          penaltyCold: 1,
          minScore: 1,
        },
        associate,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(h.profileRepo.upsert).not.toHaveBeenCalled();
  });

  it("FORBIDDEN for a non-leadership caller on reset (no write)", async () => {
    await expect(openRoleService.deleteMatchProfile("c1", associate)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(h.profileRepo.delete).not.toHaveBeenCalled();
  });

  it("leadership CAN save, upserting + auditing", async () => {
    const weights = {
      weightSameClient: 1,
      weightSameState: 1,
      weightCredExact: 1,
      weightCredPartial: 1,
      weightRespondedHot: 1,
      weightOutreach: 1,
      weightSourced: 1,
      penaltyCold: 1,
      minScore: 1,
    };
    h.profileRepo.upsert.mockResolvedValue({ clientId: "c1", ...weights, updatedById: owner.id });
    const saved = await openRoleService.saveMatchProfile("c1", weights, owner);
    expect(h.profileRepo.upsert).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining(weights),
      h.fakeTx,
    );
    expect(saved.isDefault).toBe(false);
  });

  it("returns isDefault=true when a client has no saved row", async () => {
    h.profileRepo.findByClientId.mockResolvedValue(null);
    const profile = await openRoleService.getMatchProfile("c1");
    expect(profile.isDefault).toBe(true);
    expect(profile.weightSameClient).toBe(30); // DEFAULT_MATCH_WEIGHTS
  });
});

describe("openRoleService.parseJd", () => {
  it("delegates to extractJd", async () => {
    h.extractJd.mockResolvedValue({
      title: "PMHNP",
      credential: "PMHNP",
      state: "NJ",
      city: null,
      setting: "Telehealth",
      population: "Adult",
      rate: "$90/hr",
      priority: "P2",
      description: "A telehealth role.",
    });
    const parsed = await openRoleService.parseJd({
      text: "We are hiring a PMHNP for telehealth work in NJ.",
    });
    expect(h.extractJd).toHaveBeenCalledWith("We are hiring a PMHNP for telehealth work in NJ.");
    expect(parsed.title).toBe("PMHNP");
  });
});
