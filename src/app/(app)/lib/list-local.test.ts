import { describe, it, expect } from "vitest";
import { HOT_SCORE } from "@/lib/constants";
import { filterHotLocal, mergePage } from "./list-local";

describe("filterHotLocal", () => {
  it("keeps only rows at or above HOT_SCORE and drops null scores", () => {
    const rows = [
      { id: "a", score: HOT_SCORE },
      { id: "b", score: HOT_SCORE - 1 },
      { id: "c", score: 100 },
      { id: "d", score: null },
    ];
    expect(filterHotLocal(rows).map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("returns a new array (does not mutate input)", () => {
    const rows = [{ id: "a", score: 90 }];
    expect(filterHotLocal(rows)).not.toBe(rows);
  });
});

describe("mergePage", () => {
  it("appends the next page, preserving order", () => {
    const merged = mergePage([{ id: "a" }, { id: "b" }], [{ id: "c" }, { id: "d" }]);
    expect(merged.map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("dedupes by id (first occurrence wins) if a row reappears across pages", () => {
    const merged = mergePage([{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "c" }]);
    expect(merged.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});
