import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AuthUser } from "@/server/auth/guards";

/**
 * Proves the Client Discovery service's writes and search/dedupe logic WITHOUT a DB or a real
 * NPPES/Apollo/Hunter call — mirrors `lead.service.test.ts`'s style. `prospectRepository`,
 * `prospectContactRepository`, `userRepository`, `searchNppes`, `findApolloContacts`,
 * `findHunterContacts`, `checkRateLimit`, `writeAudit`, and `withTransaction` are all mocked.
 */

const h = vi.hoisted(() => ({
  fakeTx: { __tx: true },
  associate: { id: "u1", email: "u@desta.works", name: "Test User", role: "Associate" as const },
  prospectRepo: {
    create: vi.fn(),
    findById: vi.fn(),
    list: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    restore: vi.fn(),
    findManyByIds: vi.fn(),
    findManyByNpis: vi.fn(),
    createMany: vi.fn(),
  },
  contactRepo: {
    create: vi.fn(),
    createMany: vi.fn(),
    listByProspect: vi.fn(),
    softDelete: vi.fn(),
  },
  userRepo: { namesByIds: vi.fn() },
  searchNppes: vi.fn(),
  findApolloContacts: vi.fn(),
  findHunterContacts: vi.fn(),
  checkRateLimit: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/repositories/prospect.repository", () => ({
  prospectRepository: h.prospectRepo,
}));
vi.mock("@/server/repositories/prospect-contact.repository", () => ({
  prospectContactRepository: h.contactRepo,
}));
vi.mock("@/server/repositories/user.repository", () => ({ userRepository: h.userRepo }));
vi.mock("@/server/integrations/nppes", () => ({ searchNppes: h.searchNppes }));
vi.mock("@/server/integrations/apollo", () => ({ findApolloContacts: h.findApolloContacts }));
vi.mock("@/server/integrations/hunter", () => ({ findHunterContacts: h.findHunterContacts }));
vi.mock("@/server/http/rate-limit", () => ({ checkRateLimit: h.checkRateLimit }));
vi.mock("@/server/db/audit", () => ({ writeAudit: h.writeAudit }));
vi.mock("@/server/db/with-transaction", () => ({
  withTransaction: (fn: (tx: unknown) => unknown) => fn(h.fakeTx),
}));

import { prospectService } from "./prospect.service";

const associate = h.associate as AuthUser;

function prospect(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    practiceName: "Sterling Institute",
    npi: "1234567890",
    taxonomy: "Behavioral Health",
    city: "New Haven",
    state: "CT",
    zip: "06510",
    phone: "555-0100",
    website: null,
    status: "Fresh Lead",
    ownerId: null,
    notes: null,
    source: "NPPES Search",
    icpId: null,
    createdById: "u1",
    createdAt: new Date("2026-07-01T00:00:00Z"),
    updatedAt: new Date("2026-07-01T00:00:00Z"),
    deletedAt: null,
    deletedById: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.contactRepo.listByProspect.mockResolvedValue([]);
  h.userRepo.namesByIds.mockResolvedValue(new Map());
  h.prospectRepo.findManyByNpis.mockResolvedValue([]);
});

describe("prospectService.create", () => {
  it("forces status='Fresh Lead' and source='Manual', ignoring any client-seeded value", async () => {
    h.prospectRepo.create.mockResolvedValue(prospect());
    await prospectService.create({ practiceName: "Sterling Institute" }, associate);
    expect(h.prospectRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: "Fresh Lead", source: "Manual", createdById: "u1" }),
      h.fakeTx,
    );
    expect(h.writeAudit).toHaveBeenCalledWith(
      h.fakeTx,
      expect.objectContaining({ entity: "prospect", action: "create" }),
    );
  });
});

describe("prospectService.list", () => {
  it("resolves owner display names via a single batched userRepository.namesByIds call", async () => {
    h.prospectRepo.count.mockResolvedValue(1);
    h.prospectRepo.list.mockResolvedValue([prospect({ ownerId: "u2" })]);
    h.userRepo.namesByIds.mockResolvedValue(new Map([["u2", "Manager Mo"]]));
    const result = await prospectService.list({});
    expect(result.prospects[0]!.ownerName).toBe("Manager Mo");
    expect(h.userRepo.namesByIds).toHaveBeenCalledWith(["u2"]);
  });
});

describe("prospectService.update", () => {
  it("throws CONFLICT for a converted (Client) prospect and never writes", async () => {
    h.prospectRepo.findById.mockResolvedValue(prospect({ status: "Client" }));
    await expect(
      prospectService.update("p1", { status: "Contacted" }, associate),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(h.prospectRepo.update).not.toHaveBeenCalled();
  });

  it("patches status + audits for a live (non-Client) prospect", async () => {
    h.prospectRepo.findById.mockResolvedValueOnce(prospect()).mockResolvedValueOnce(prospect());
    h.prospectRepo.update.mockResolvedValue(prospect({ status: "Contacted" }));
    await prospectService.update("p1", { status: "Contacted" }, associate);
    expect(h.prospectRepo.update).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ status: "Contacted" }),
      h.fakeTx,
    );
    expect(h.writeAudit).toHaveBeenCalled();
  });
});

describe("prospectService.search", () => {
  it("rate-limits per-user, maps NPPES org rows, and flags already-tracked NPIs", async () => {
    h.searchNppes.mockResolvedValue({
      resultCount: 1,
      results: [
        {
          number: "1234567890",
          basic: { organization_name: "Sterling Institute" },
          addresses: [
            { address_purpose: "LOCATION", city: "New Haven", state: "CT", postal_code: "06510" },
          ],
          taxonomies: [{ code: "x", desc: "Behavioral Health", primary: true }],
        },
      ],
    });
    h.prospectRepo.findManyByNpis.mockResolvedValue([{ npi: "1234567890" }]);
    const result = await prospectService.search({ state: "CT" }, associate);
    expect(h.checkRateLimit).toHaveBeenCalledWith("client-discovery-search:u1", expect.any(Object));
    expect(h.searchNppes).toHaveBeenCalledWith(
      expect.objectContaining({ enumerationType: "NPI-2", state: "CT" }),
    );
    expect(result.results[0]).toMatchObject({
      npi: "1234567890",
      practiceName: "Sterling Institute",
      taxonomy: "Behavioral Health",
      alreadyTracked: true,
    });
  });

  it("maps a selected specialty to its NPPES query via specialtyTaxonomyQuery (legacy parity)", async () => {
    h.searchNppes.mockResolvedValue({ resultCount: 0, results: [] });
    await prospectService.search({ taxonomy: "Behavioral Health", state: "CT" }, associate);
    expect(h.searchNppes).toHaveBeenCalledWith(
      expect.objectContaining({ taxonomyDescription: "Behavioral" }),
    );

    h.searchNppes.mockClear();
    await prospectService.search({ taxonomy: "Behavior Analyst (BCBA)" }, associate);
    expect(h.searchNppes).toHaveBeenCalledWith(
      expect.objectContaining({ taxonomyDescription: "Behavior Analyst (BCBA)" }),
    );
  });
});

describe("prospectService.addFromSearch", () => {
  it("dedupes against already-tracked NPIs (fresh check, not trusting the client)", async () => {
    h.prospectRepo.findManyByNpis.mockResolvedValue([{ npi: "9999999999" }]);
    h.prospectRepo.createMany.mockResolvedValue({ count: 1 });
    const result = await prospectService.addFromSearch(
      {
        rows: [
          { npi: "9999999999", practiceName: "Already Tracked" },
          { npi: "1111111111", practiceName: "New Practice" },
        ],
      },
      associate,
    );
    expect(result).toEqual({ added: 1, skipped: 1 });
    expect(h.prospectRepo.createMany).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          npi: "1111111111",
          status: "Fresh Lead",
          source: "NPPES Search",
        }),
      ],
      h.fakeTx,
    );
  });

  it("reports the actual insert count, not the pre-insert candidate count, when a concurrent request wins the race on a shared NPI", async () => {
    h.prospectRepo.findManyByNpis.mockResolvedValue([]);
    // Two rows pass the pre-check, but skipDuplicates only actually inserted one (a concurrent
    // request claimed the other's NPI in between) — `added` must reflect that, not `kept.length`.
    h.prospectRepo.createMany.mockResolvedValue({ count: 1 });
    const result = await prospectService.addFromSearch(
      {
        rows: [
          { npi: "1111111111", practiceName: "Practice A" },
          { npi: "2222222222", practiceName: "Practice B" },
        ],
      },
      associate,
    );
    expect(result).toEqual({ added: 1, skipped: 1 });
  });
});

describe("prospectService.bulkAction", () => {
  it("skips a converted (Client) prospect for a status action, reporting it as skipped", async () => {
    h.prospectRepo.findManyByIds.mockResolvedValue([
      prospect({ id: "p1", status: "Fresh Lead" }),
      prospect({ id: "p2", status: "Client" }),
    ]);
    const result = await prospectService.bulkAction(
      { action: "status", ids: ["p1", "p2"], value: "Contacted" },
      associate,
    );
    expect(result).toEqual({ affected: 1, skipped: 1 });
    expect(h.prospectRepo.update).toHaveBeenCalledTimes(1);
    expect(h.prospectRepo.update).toHaveBeenCalledWith("p1", { status: "Contacted" }, h.fakeTx);
  });

  it("delete is never blocked by status (only by already being trashed, excluded upstream)", async () => {
    h.prospectRepo.findManyByIds.mockResolvedValue([prospect({ id: "p1", status: "Client" })]);
    const result = await prospectService.bulkAction({ action: "delete", ids: ["p1"] }, associate);
    expect(result).toEqual({ affected: 1, skipped: 0 });
    expect(h.prospectRepo.softDelete).toHaveBeenCalledWith("p1", "u1", h.fakeTx);
  });
});

describe("prospectService.softDelete / restore", () => {
  it("softDelete audits with before/after deletedAt", async () => {
    h.prospectRepo.findById.mockResolvedValue(prospect());
    h.prospectRepo.softDelete.mockResolvedValue(
      prospect({ deletedAt: new Date("2026-07-05T00:00:00Z"), deletedById: "u1" }),
    );
    const result = await prospectService.softDelete("p1", associate);
    expect(result).toEqual({ id: "p1" });
    expect(h.writeAudit).toHaveBeenCalledWith(
      h.fakeTx,
      expect.objectContaining({ entity: "prospect", action: "delete" }),
    );
  });

  it("restore throws CONFLICT when the prospect is not deleted", async () => {
    h.prospectRepo.findById.mockResolvedValue(prospect({ deletedAt: null }));
    await expect(prospectService.restore("p1", associate)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(h.prospectRepo.restore).not.toHaveBeenCalled();
  });
});
