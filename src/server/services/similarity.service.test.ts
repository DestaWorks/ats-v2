import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AuthUser } from "@/server/auth/guards";

/**
 * Proves `similarityService.findSimilar`'s taxonomy-gate, exact-desc precision filter,
 * dedupe-to-net-new filter, and state-similarity ranking WITHOUT a DB or a real network call.
 * `mapResult`/`buildDupSets` (reused from `discover.service.ts`) and
 * `classifyDiscoverRow`/`scoreStateSimilarity` all run for REAL — only `searchNppes` and the
 * repositories they call down to are mocked, same posture as `discover.service.test.ts`.
 */

const h = vi.hoisted(() => ({
  user: { id: "u1", email: "u@desta.works", name: "Test User", role: "Associate" as const },
  leadRepo: { findManyByNpis: vi.fn(), findManyByNames: vi.fn() },
  candidateRepo: { findManyByNames: vi.fn() },
  searchNppes: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/repositories/lead.repository", () => ({ leadRepository: h.leadRepo }));
vi.mock("@/server/repositories/candidate.repository", () => ({
  candidateRepository: h.candidateRepo,
}));
vi.mock("@/server/integrations/nppes", () => ({ searchNppes: h.searchNppes }));
vi.mock("@/server/http/rate-limit", () => ({ checkRateLimit: vi.fn() }));

import { similarityService } from "./similarity.service";

const user = h.user as AuthUser;

/** `desc` defaults to the REAL, verified PMHNP taxonomy description (see `constants/nppes.ts`'s
 *  `matchDesc` for "pmhnp") — NOT the display-string format the old, broken `query` used. */
function rawResult(overrides: Record<string, unknown> = {}) {
  return {
    number: "1234567890",
    basic: { first_name: "Jane", last_name: "Doe", credential: "PMHNP" },
    addresses: [{ address_purpose: "LOCATION", city: "Stamford", state: "CT" }],
    taxonomies: [
      {
        code: "364SP0808X",
        desc: "Nurse Practitioner, Psych/Mental Health",
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

describe("similarityService.findSimilar", () => {
  it("throws BAD_REQUEST for a credential with no verified taxonomy mapping", async () => {
    await expect(
      similarityService.findSimilar({ credential: "LPC", state: "CT" }, user),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(h.searchNppes).not.toHaveBeenCalled();
  });

  it("searches NPPES by the mapped taxonomy's verified search seed, nationwide (no state filter)", async () => {
    h.searchNppes.mockResolvedValue({ resultCount: 0, results: [] });
    await similarityService.findSimilar({ credential: "PMHNP", state: "CT" }, user);
    expect(h.searchNppes).toHaveBeenCalledWith({ taxonomyDescription: "Psych/Mental Health" });
  });

  it("excludes a result whose taxonomy desc doesn't EXACTLY match the target — NPPES's own search is loose", async () => {
    h.searchNppes.mockResolvedValue({
      resultCount: 2,
      results: [
        rawResult({ number: "1111111111", basic: { first_name: "Jane", last_name: "Doe" } }),
        // NPPES's loose "Psych/Mental Health" search also surfaces unrelated taxonomies —
        // this row must be filtered out even though it came back in the same search.
        rawResult({
          number: "3333333333",
          basic: { first_name: "Noise", last_name: "Row" },
          taxonomies: [
            {
              code: "X",
              desc: "Registered Nurse, Psych/Mental Health",
              state: "CT",
              primary: true,
            },
          ],
        }),
      ],
    });
    const out = await similarityService.findSimilar({ credential: "PMHNP", state: "CT" }, user);
    expect(out.results).toHaveLength(1);
    expect(out.results[0]?.npi).toBe("1111111111");
  });

  it("excludes a result already known as a lead or candidate — only net-new providers return", async () => {
    h.searchNppes.mockResolvedValue({
      resultCount: 2,
      results: [
        rawResult({ number: "1111111111", basic: { first_name: "Jane", last_name: "Doe" } }),
        rawResult({ number: "2222222222", basic: { first_name: "Sam", last_name: "Roe" } }),
      ],
    });
    h.leadRepo.findManyByNpis.mockResolvedValue([
      { id: "l1", npi: "1111111111", name: "Jane Doe", status: "Sourced" },
    ]);
    const out = await similarityService.findSimilar({ credential: "PMHNP", state: "CT" }, user);
    expect(out.results).toHaveLength(1);
    expect(out.results[0]?.npi).toBe("2222222222");
  });

  it("ranks results by state similarity, exact match first", async () => {
    h.searchNppes.mockResolvedValue({
      resultCount: 2,
      results: [
        rawResult({
          number: "1111111111",
          basic: { first_name: "Amy", last_name: "Tan" },
          addresses: [{ address_purpose: "LOCATION", city: "Austin", state: "TX" }],
        }),
        rawResult({
          number: "2222222222",
          basic: { first_name: "Jane", last_name: "Doe" },
          addresses: [{ address_purpose: "LOCATION", city: "Stamford", state: "CT" }],
        }),
      ],
    });
    const out = await similarityService.findSimilar({ credential: "PMHNP", state: "CT" }, user);
    expect(out.results.map((r) => r.npi)).toEqual(["2222222222", "1111111111"]);
    expect(out.results[0]?.similarityScore).toBe(100); // exact state match
    expect(out.results[1]?.similarityScore).toBe(60); // CT and TX both NLC compact
  });

  it("echoes the searched taxonomy label", async () => {
    h.searchNppes.mockResolvedValue({ resultCount: 0, results: [] });
    const out = await similarityService.findSimilar({ credential: "PMHNP", state: null }, user);
    expect(out.taxonomyLabel).toBe("Psychiatric NP (PMHNP)");
  });
});
