import { describe, expect, it } from "vitest";
import { HOT_SCORE } from "@/lib/constants";
import { buildListQuery, filterHotLocal, mergePage, sortByFitLocal } from "./list-pagination";

/** Minimal scored row — the two toggles only read `score` (and `id` for merge). */
function row(id: string, score: number | null) {
  return { id, score };
}

describe("sortByFitLocal", () => {
  it("orders by score desc with nulls last", () => {
    const out = sortByFitLocal([row("a", 40), row("b", null), row("c", 90), row("d", 0)]);
    expect(out.map((r) => r.id)).toEqual(["c", "a", "d", "b"]);
  });

  it("keeps a real 0 above a null (0 is a legit low score, null is 'unscored')", () => {
    const out = sortByFitLocal([row("null", null), row("zero", 0)]);
    expect(out.map((r) => r.id)).toEqual(["zero", "null"]);
  });

  it("is stable for equal scores and for all-null input", () => {
    expect(sortByFitLocal([row("a", 50), row("b", 50), row("c", 50)]).map((r) => r.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(sortByFitLocal([row("x", null), row("y", null)]).map((r) => r.id)).toEqual(["x", "y"]);
  });

  it("does not mutate the input", () => {
    const input = [row("a", 10), row("b", 90)];
    sortByFitLocal(input);
    expect(input.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("filterHotLocal", () => {
  it("keeps only rows with score >= HOT_SCORE, dropping nulls", () => {
    const out = filterHotLocal([
      row("hot", HOT_SCORE),
      row("hotter", HOT_SCORE + 5),
      row("cold", HOT_SCORE - 1),
      row("unscored", null),
    ]);
    expect(out.map((r) => r.id)).toEqual(["hot", "hotter"]);
  });

  it("returns empty when nothing qualifies", () => {
    expect(filterHotLocal([row("a", 0), row("b", null)])).toEqual([]);
  });
});

describe("mergePage", () => {
  it("appends the next page after the existing rows", () => {
    const out = mergePage([row("a", 1), row("b", 2)], [row("c", 3), row("d", 4)]);
    expect(out.map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("dedupes by id, keeping the first occurrence", () => {
    const out = mergePage([row("a", 1), row("b", 2)], [row("b", 99), row("c", 3)]);
    expect(out.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(out.find((r) => r.id === "b")?.score).toBe(2);
  });

  it("does not mutate the existing array", () => {
    const existing = [row("a", 1)];
    mergePage(existing, [row("b", 2)]);
    expect(existing).toHaveLength(1);
  });
});

describe("buildListQuery", () => {
  it("carries the server filters + sort and appends the cursor", () => {
    const sp = new URLSearchParams({
      track: "Clinical",
      clientId: "c1",
      status: "0 - New Candidate",
      search: "jane",
      tags: "Priority,Bilingual",
      licenseStatus: "Active",
      mine: "1",
      overdue: "1",
      stuck: "1",
      sort: "oldest",
    });
    const out = new URLSearchParams(buildListQuery(sp, "CURSOR123"));
    expect(out.get("track")).toBe("Clinical");
    expect(out.get("clientId")).toBe("c1");
    expect(out.get("status")).toBe("0 - New Candidate");
    expect(out.get("search")).toBe("jane");
    expect(out.get("tags")).toBe("Priority,Bilingual");
    expect(out.get("licenseStatus")).toBe("Active");
    expect(out.get("mine")).toBe("1");
    expect(out.get("overdue")).toBe("1");
    expect(out.get("stuck")).toBe("1");
    expect(out.get("sort")).toBe("oldest");
    expect(out.get("cursor")).toBe("CURSOR123");
  });

  it("omits absent params and does not forward page-local toggles", () => {
    const sp = new URLSearchParams({ track: "Operations", hot: "1", fit: "1" });
    const out = new URLSearchParams(buildListQuery(sp, null));
    expect(out.get("track")).toBe("Operations");
    expect(out.has("clientId")).toBe(false);
    expect(out.has("cursor")).toBe(false);
    expect(out.has("hot")).toBe(false);
    expect(out.has("fit")).toBe(false);
  });
});
