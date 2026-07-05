import { describe, it, expect } from "vitest";
import { buildActivityQuery, diffChangedKeys, formatActivityValue } from "./activity-query";

describe("buildActivityQuery", () => {
  it("carries the filter params and the cursor, dropping empties", () => {
    const sp = new URLSearchParams({ action: "move", entity: "candidate", actor: "u1" });
    const query = buildActivityQuery(sp, "cur123");
    const out = new URLSearchParams(query);
    expect(out.get("action")).toBe("move");
    expect(out.get("entity")).toBe("candidate");
    expect(out.get("actor")).toBe("u1");
    expect(out.get("cursor")).toBe("cur123");
  });

  it("carries the date range", () => {
    const sp = new URLSearchParams({ from: "2026-01-01", to: "2026-02-01" });
    const out = new URLSearchParams(buildActivityQuery(sp, null));
    expect(out.get("from")).toBe("2026-01-01");
    expect(out.get("to")).toBe("2026-02-01");
    expect(out.has("cursor")).toBe(false);
  });

  it("omits empty filter values and a null cursor", () => {
    const sp = new URLSearchParams({ action: "", actor: "u9" });
    const out = new URLSearchParams(buildActivityQuery(sp, null));
    expect(out.has("action")).toBe(false);
    expect(out.get("actor")).toBe("u9");
    expect(out.has("cursor")).toBe(false);
  });

  it("ignores params outside the known filter set", () => {
    const sp = new URLSearchParams({ action: "create", bogus: "x" });
    const out = new URLSearchParams(buildActivityQuery(sp, null));
    expect(out.get("action")).toBe("create");
    expect(out.has("bogus")).toBe(false);
  });
});

describe("diffChangedKeys", () => {
  it("returns only the keys whose values differ, with before/after", () => {
    const before = { status: "0 - New", name: "Ada", score: 50 };
    const after = { status: "1 - Screening", name: "Ada", score: 60 };
    expect(diffChangedKeys(before, after)).toEqual([
      { key: "score", before: 50, after: 60 },
      { key: "status", before: "0 - New", after: "1 - Screening" },
    ]);
  });

  it("surfaces added and removed keys (undefined on the missing side)", () => {
    expect(diffChangedKeys({ a: 1 }, { a: 1, b: 2 })).toEqual([
      { key: "b", before: undefined, after: 2 },
    ]);
    expect(diffChangedKeys({ a: 1, b: 2 }, { a: 1 })).toEqual([
      { key: "b", before: 2, after: undefined },
    ]);
  });

  it("returns an empty list when nothing changed (incl. reordered nested keys)", () => {
    expect(diffChangedKeys({ a: 1 }, { a: 1 })).toEqual([]);
    expect(diffChangedKeys({ meta: { x: 1, y: 2 } }, { meta: { y: 2, x: 1 } })).toEqual([]);
  });

  it("detects a nested value change", () => {
    expect(diffChangedKeys({ meta: { x: 1 } }, { meta: { x: 2 } })).toEqual([
      { key: "meta", before: { x: 1 }, after: { x: 2 } },
    ]);
  });

  it("treats a null / non-object snapshot as no keys", () => {
    expect(diffChangedKeys(null, { a: 1 })).toEqual([{ key: "a", before: undefined, after: 1 }]);
    expect(diffChangedKeys(null, null)).toEqual([]);
    expect(diffChangedKeys("x", "y")).toEqual([]);
  });
});

describe("formatActivityValue", () => {
  it("renders an absent key as an em-dash and null explicitly", () => {
    expect(formatActivityValue(undefined)).toBe("—");
    expect(formatActivityValue(null)).toBe("null");
  });

  it("passes strings through and JSON-stringifies other values", () => {
    expect(formatActivityValue("Ada")).toBe("Ada");
    expect(formatActivityValue(42)).toBe("42");
    expect(formatActivityValue(true)).toBe("true");
    expect(formatActivityValue({ x: 1 })).toBe('{"x":1}');
  });
});
