import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AuthUser } from "@/server/auth/guards";

/**
 * Proves discoverService's NPPES→DTO mapping, dedupe composition, and the add-to-sourcing write
 * WITHOUT a DB or a real network call. The pure `discover-dedupe` rules run for real; the
 * repositories, `searchNppes`, `writeAudit`, and `withTransaction` are mocked.
 */

const h = vi.hoisted(() => ({
  fakeTx: { __tx: true },
  user: { id: "u1", email: "u@desta.works", name: "Test User", role: "Associate" as const },
  leadRepo: {
    findManyByNpis: vi.fn(),
    findManyByNames: vi.fn(),
    createMany: vi.fn(),
  },
  candidateRepo: {
    findManyByNames: vi.fn(),
  },
  searchNppes: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/repositories/lead.repository", () => ({ leadRepository: h.leadRepo }));
vi.mock("@/server/repositories/candidate.repository", () => ({
  candidateRepository: h.candidateRepo,
}));
vi.mock("@/server/integrations/nppes", () => ({ searchNppes: h.searchNppes }));
vi.mock("@/server/db/audit", () => ({ writeAudit: h.writeAudit }));
vi.mock("@/server/db/with-transaction", () => ({
  withTransaction: (fn: (tx: unknown) => unknown) => fn(h.fakeTx),
}));
vi.mock("@/server/http/rate-limit", () => ({ checkRateLimit: vi.fn() }));

import { discoverService } from "./discover.service";

const user = h.user as AuthUser;

function rawResult(overrides: Record<string, unknown> = {}) {
  return {
    number: "1234567890",
    basic: { first_name: "Jane", last_name: "Doe", credential: "MD" },
    addresses: [
      {
        address_purpose: "LOCATION",
        city: "Stamford",
        state: "CT",
        telephone_number: "203-555-0100",
      },
    ],
    taxonomies: [
      {
        code: "2084P0800X",
        desc: "Psychiatry & Neurology, Psychiatry",
        state: "CT",
        license: "039647",
        primary: true,
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.leadRepo.findManyByNpis.mockResolvedValue([]);
  h.leadRepo.findManyByNames.mockResolvedValue([]);
  h.candidateRepo.findManyByNames.mockResolvedValue([]);
});

describe("discoverService.search", () => {
  it("maps a raw NPPES result to a DTO row with the fields the UI needs", async () => {
    h.searchNppes.mockResolvedValue({ resultCount: 1, results: [rawResult()] });
    const out = await discoverService.search({ lastName: "Doe" }, user);
    expect(out.resultCount).toBe(1);
    expect(out.results[0]).toMatchObject({
      npi: "1234567890",
      firstName: "Jane",
      lastName: "Doe",
      credential: "MD",
      city: "Stamford",
      state: "CT",
      phone: "203-555-0100",
      taxonomyDesc: "Psychiatry & Neurology, Psychiatry",
      licenseNumber: "039647",
      licenseState: "CT",
      dupStatus: "new",
    });
  });

  it("marks a row in_sourcing when its NPI matches an existing lead", async () => {
    h.searchNppes.mockResolvedValue({ resultCount: 1, results: [rawResult()] });
    h.leadRepo.findManyByNpis.mockResolvedValue([
      { id: "l1", npi: "1234567890", name: "Jane Doe", status: "Sourced" },
    ]);
    const out = await discoverService.search({ lastName: "Doe" }, user);
    expect(out.results[0]?.dupStatus).toBe("in_sourcing");
    expect(out.results[0]?.dupMatchId).toBe("l1");
  });

  it("marks a row in_pipeline when its name matches an existing candidate, even if the NPI is fresh", async () => {
    h.searchNppes.mockResolvedValue({ resultCount: 1, results: [rawResult()] });
    h.candidateRepo.findManyByNames.mockResolvedValue([
      { id: "c1", name: "Jane Doe", status: "3 - Screening" },
    ]);
    const out = await discoverService.search({ lastName: "Doe" }, user);
    expect(out.results[0]?.dupStatus).toBe("in_pipeline");
    expect(out.results[0]?.dupMatchId).toBe("c1");
  });

  it("searches NPPES using the selected taxonomy's verified query seed", async () => {
    h.searchNppes.mockResolvedValue({ resultCount: 1, results: [rawResult()] });
    await discoverService.search({ taxonomy: "psychiatry" }, user);
    expect(h.searchNppes).toHaveBeenCalledWith(
      expect.objectContaining({ taxonomyDescription: "Psychiatry" }),
    );
  });

  it("filters out a result whose taxonomy desc doesn't EXACTLY match the selected option — NPPES's own search is loose", async () => {
    h.searchNppes.mockResolvedValue({
      resultCount: 2,
      results: [
        rawResult(), // real desc: "Psychiatry & Neurology, Psychiatry" — matches "psychiatry"
        rawResult({
          number: "9999999999",
          basic: { first_name: "Noise", last_name: "Row" },
          taxonomies: [{ code: "X", desc: "Psychiatric Hospital", state: "CT", primary: true }],
        }),
      ],
    });
    const out = await discoverService.search({ taxonomy: "psychiatry" }, user);
    expect(out.results).toHaveLength(1);
    expect(out.results[0]?.npi).toBe("1234567890");
  });

  it("applies no taxonomy filter when no taxonomy was selected (name/city-only search)", async () => {
    h.searchNppes.mockResolvedValue({
      resultCount: 1,
      results: [
        rawResult({
          taxonomies: [{ code: "X", desc: "Unrelated Taxonomy", state: "CT", primary: true }],
        }),
      ],
    });
    const out = await discoverService.search({ lastName: "Doe" }, user);
    expect(out.results).toHaveLength(1);
  });
});

describe("discoverService.addToSourcing", () => {
  const row = {
    npi: "1234567890",
    name: "Jane Doe",
    credential: "MD",
    state: "CT",
    city: "Stamford",
    phone: "203-555-0100",
    taxonomyDesc: "Psychiatry",
    licenseNumber: "039647",
  };

  it("creates the lead with source forced to NPPES and audits in one tx", async () => {
    const result = await discoverService.addToSourcing({ rows: [row], clientId: "cl1" }, user);
    expect(result).toEqual({ added: 1, skipped: 0 });
    const [rows, tx, opts] = h.leadRepo.createMany.mock.calls[0]!;
    expect(tx).toBe(h.fakeTx);
    expect(opts).toEqual({ skipDuplicates: true });
    expect(rows[0]).toMatchObject({
      name: "Jane Doe",
      npi: "1234567890",
      source: "NPPES",
      status: "Sourced",
      clientId: "cl1",
      createdById: "u1",
    });
    expect(h.writeAudit.mock.calls[0]![1]).toMatchObject({
      entity: "source_lead",
      action: "add_from_discover",
      after: { count: 1, source: "NPPES" },
    });
  });

  it("skips a row whose NPI already matches an existing lead", async () => {
    h.leadRepo.findManyByNpis.mockResolvedValue([
      { id: "l1", npi: "1234567890", name: "Someone Else", status: "Sourced" },
    ]);
    const result = await discoverService.addToSourcing({ rows: [row] }, user);
    expect(result).toEqual({ added: 0, skipped: 1 });
    expect(h.leadRepo.createMany).not.toHaveBeenCalled();
  });

  it("skips a row whose name already matches an existing candidate (not caught by NPI alone)", async () => {
    h.candidateRepo.findManyByNames.mockResolvedValue([
      { id: "c1", name: "Jane Doe", status: "1 - Initial Screening" },
    ]);
    const result = await discoverService.addToSourcing({ rows: [row] }, user);
    expect(result).toEqual({ added: 0, skipped: 1 });
    expect(h.leadRepo.createMany).not.toHaveBeenCalled();
  });

  it("collapses an intra-batch duplicate NPI to a single add", async () => {
    const result = await discoverService.addToSourcing({ rows: [row, { ...row }] }, user);
    expect(result).toEqual({ added: 1, skipped: 1 });
    const [rows] = h.leadRepo.createMany.mock.calls[0]!;
    expect(rows).toHaveLength(1);
  });
});
