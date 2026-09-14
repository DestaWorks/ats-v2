import { describe, it, expect } from "vitest";
import {
  filterKey,
  firstValue,
  pageNumber,
  readSearchParams,
  splitCsv,
  toUrlSearchParams,
} from "./search-params";

describe("firstValue", () => {
  it("returns a single value unchanged", () => {
    expect(firstValue("a")).toBe("a");
  });

  it("takes the first of a repeated param", () => {
    expect(firstValue(["a", "b"])).toBe("a");
  });

  it("is undefined for a missing param and for an empty repeat", () => {
    expect(firstValue(undefined)).toBeUndefined();
    expect(firstValue([])).toBeUndefined();
  });
});

describe("pageNumber", () => {
  it("reads a positive integer", () => {
    expect(pageNumber("3")).toBe(3);
    expect(pageNumber(" 4 ")).toBe(4);
  });

  it("falls back to 1 for a missing, blank, zero, negative or fractional page", () => {
    expect(pageNumber(undefined)).toBe(1);
    expect(pageNumber("")).toBe(1);
    expect(pageNumber("0")).toBe(1);
    expect(pageNumber("-3")).toBe(1);
    expect(pageNumber("2.5")).toBe(1);
  });

  it("falls back to 1 for non-numeric input rather than trusting a prefix", () => {
    expect(pageNumber("abc")).toBe(1);
    expect(pageNumber("2abc")).toBe(1);
    expect(pageNumber("Infinity")).toBe(1);
  });
});

describe("splitCsv", () => {
  it("trims members and drops empties", () => {
    expect(splitCsv("a, b ,,c")).toEqual(["a", "b", "c"]);
  });

  it("is empty for a missing or blank value", () => {
    expect(splitCsv(undefined)).toEqual([]);
    expect(splitCsv(",")).toEqual([]);
  });
});

describe("filterKey", () => {
  it("joins parts, rendering absent ones as blanks so positions stay stable", () => {
    expect(filterKey("Hot", undefined, true, 2)).toBe("Hot||true|2");
  });
});

describe("toUrlSearchParams", () => {
  it("keeps first values and drops empty ones", () => {
    const params = toUrlSearchParams({ a: ["1", "2"], b: "", c: undefined, d: "x" });
    expect(params.toString()).toBe("a=1&d=x");
  });
});

describe("readSearchParams", () => {
  const TRACKS = ["Clinical", "Operations"] as const;
  const isTrack = (value: string): value is (typeof TRACKS)[number] =>
    (TRACKS as readonly string[]).includes(value);

  it("exposes the raw params for a client child", () => {
    const raw = { a: "1" };
    expect(readSearchParams(raw).raw).toBe(raw);
  });

  it("str keeps a blank verbatim; text reads blank and whitespace as absent", () => {
    const q = readSearchParams({ search: "  ", empty: "", padded: " bob " });
    expect(q.str("search")).toBe("  ");
    expect(q.str("empty")).toBe("");
    expect(q.str("missing")).toBeUndefined();
    expect(q.text("search")).toBeUndefined();
    expect(q.text("empty")).toBeUndefined();
    expect(q.text("padded")).toBe("bob");
    expect(q.text("missing")).toBeUndefined();
  });

  it("flag accepts only 1; flagLoose also accepts true", () => {
    const q = readSearchParams({ on: "1", spelled: "true", off: "0", missing: undefined });
    expect(q.flag("on")).toBe(true);
    expect(q.flag("spelled")).toBe(false);
    expect(q.flag("off")).toBe(false);
    expect(q.flag("missing")).toBe(false);
    expect(q.flagLoose("on")).toBe(true);
    expect(q.flagLoose("spelled")).toBe(true);
    expect(q.flagLoose("off")).toBe(false);
    expect(q.flagLoose("missing")).toBe(false);
  });

  it("page reads the page param and honours an alternate key", () => {
    expect(readSearchParams({ page: "4" }).page()).toBe(4);
    expect(readSearchParams({}).page()).toBe(1);
    expect(readSearchParams({ p: "7" }).page("p")).toBe(7);
  });

  it("page takes the first of a repeated param", () => {
    expect(readSearchParams({ page: ["2", "9"] }).page()).toBe(2);
  });

  it("oneOf admits a member and rejects anything else", () => {
    const q = readSearchParams({
      good: "Clinical",
      bad: "Nope",
      blank: "",
      repeated: ["Clinical"],
    });
    expect(q.oneOf("good", TRACKS)).toBe("Clinical");
    expect(q.oneOf("bad", TRACKS)).toBeUndefined();
    expect(q.oneOf("blank", TRACKS)).toBeUndefined();
    expect(q.oneOf("missing", TRACKS)).toBeUndefined();
    expect(q.oneOf("repeated", TRACKS)).toBe("Clinical");
  });

  it("guarded admits what the domain guard accepts and rejects anything else", () => {
    const q = readSearchParams({ good: "Operations", bad: "Nope", blank: "" });
    expect(q.guarded("good", isTrack)).toBe("Operations");
    expect(q.guarded("bad", isTrack)).toBeUndefined();
    expect(q.guarded("blank", isTrack)).toBeUndefined();
    expect(q.guarded("missing", isTrack)).toBeUndefined();
  });

  it("date parses a readable bound and widens an unreadable one", () => {
    const q = readSearchParams({ from: "2026-01-02", bad: "not-a-date", blank: "" });
    expect(q.date("from")?.toISOString()).toBe("2026-01-02T00:00:00.000Z");
    expect(q.date("bad")).toBeUndefined();
    expect(q.date("blank")).toBeUndefined();
    expect(q.date("missing")).toBeUndefined();
  });

  it("csv splits a list and reads a missing or blank param as absent", () => {
    const q = readSearchParams({ tags: "a, b", blank: "" });
    expect(q.csv("tags")).toEqual(["a", "b"]);
    expect(q.csv("blank")).toBeUndefined();
    expect(q.csv("missing")).toBeUndefined();
  });
});
