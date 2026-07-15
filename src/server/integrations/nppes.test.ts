import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { searchNppes } from "./nppes";

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: () => Promise.resolve(body),
  } as Response;
}

describe("searchNppes", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds query params only for the fields actually provided", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ result_count: 0, results: [] }));
    await searchNppes({ state: "CT", taxonomyDescription: "Psychiatry" });
    const [url] = fetchMock.mock.calls[0]!;
    const params = new URL(url as string).searchParams;
    expect(params.get("state")).toBe("CT");
    expect(params.get("taxonomy_description")).toBe("Psychiatry");
    expect(params.get("first_name")).toBeNull();
    expect(params.get("last_name")).toBeNull();
    expect(params.get("enumeration_type")).toBe("NPI-1");
  });

  it("returns the mapped result count and rows on success", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        result_count: 1,
        results: [
          { number: "1234567890", basic: { first_name: "Jane" }, addresses: [], taxonomies: [] },
        ],
      }),
    );
    const out = await searchNppes({ lastName: "Doe" });
    expect(out.resultCount).toBe(1);
    expect(out.results[0]?.number).toBe("1234567890");
  });

  it("throws UPSTREAM_ERROR on a non-OK response", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, false));
    await expect(searchNppes({ lastName: "Doe" })).rejects.toMatchObject({
      code: "UPSTREAM_ERROR",
    });
  });

  it("throws UPSTREAM_ERROR when NPPES reports a body-level query error (HTTP 200)", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        Errors: [{ description: "Field state requires additional search criteria" }],
      }),
    );
    await expect(searchNppes({ state: "CT" })).rejects.toMatchObject({
      code: "UPSTREAM_ERROR",
      message: "Field state requires additional search criteria",
    });
  });

  it("throws UPSTREAM_ERROR when the fetch rejects (network error / abort)", async () => {
    fetchMock.mockRejectedValue(new Error("aborted"));
    await expect(searchNppes({ lastName: "Doe" })).rejects.toMatchObject({
      code: "UPSTREAM_ERROR",
    });
  });

  it("throws UPSTREAM_ERROR on a malformed (non-object) body", async () => {
    fetchMock.mockResolvedValue(jsonResponse(null));
    await expect(searchNppes({ lastName: "Doe" })).rejects.toMatchObject({
      code: "UPSTREAM_ERROR",
    });
  });
});
