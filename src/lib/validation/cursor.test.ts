import { describe, it, expect } from "vitest";
import { encodeCursor, decodeCursor, orderByKind, type ListOrderBy } from "./cursor";

/**
 * The keyset cursor codec — a pure, isomorphic round-trip. Encoding a row for a sort order and
 * decoding it back must reproduce the sort value + the `id` tiebreak exactly; a malformed string
 * decodes to `null` (the caller maps that to a 400). Opaqueness is a base64url wrapper, not a
 * security boundary.
 */

const row = {
  createdAt: new Date("2026-06-01T12:34:56.000Z"),
  name: "Zoë O'Brien|weird",
  id: "cku_abc123",
};

describe("cursor codec", () => {
  it("round-trips a createdAt cursor (value = ISO timestamp, id tiebreak)", () => {
    for (const orderBy of ["createdAt_desc", "createdAt_asc"] as ListOrderBy[]) {
      const encoded = encodeCursor(row, orderBy);
      const decoded = decodeCursor(encoded, orderBy);
      expect(decoded).toEqual({
        kind: "createdAt",
        value: "2026-06-01T12:34:56.000Z",
        id: "cku_abc123",
      });
    }
  });

  it("round-trips a name cursor (value = raw name, incl. delimiters/unicode)", () => {
    const encoded = encodeCursor(row, "name_asc");
    const decoded = decodeCursor(encoded, "name_asc");
    expect(decoded).toEqual({ kind: "name", value: "Zoë O'Brien|weird", id: "cku_abc123" });
  });

  it("produces an opaque base64url string (no +/= chars)", () => {
    const encoded = encodeCursor(row, "createdAt_desc");
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it("orderByKind maps name_asc → name, createdAt sorts → createdAt", () => {
    expect(orderByKind("name_asc")).toBe("name");
    expect(orderByKind("createdAt_desc")).toBe("createdAt");
    expect(orderByKind("createdAt_asc")).toBe("createdAt");
  });

  it("decodes malformed input to null (bad base64 / bad json / wrong shape)", () => {
    expect(decodeCursor("!!!not-base64!!!", "createdAt_desc")).toBeNull();
    expect(
      decodeCursor(Buffer.from("{not json").toString("base64url"), "createdAt_desc"),
    ).toBeNull();
    expect(
      decodeCursor(
        Buffer.from(JSON.stringify(["only-one"])).toString("base64url"),
        "createdAt_desc",
      ),
    ).toBeNull();
    expect(
      decodeCursor(Buffer.from(JSON.stringify([1, 2])).toString("base64url"), "createdAt_desc"),
    ).toBeNull();
  });

  it("rejects a createdAt cursor whose value is not a real date", () => {
    const bad = Buffer.from(JSON.stringify(["not-a-date", "c1"])).toString("base64url");
    expect(decodeCursor(bad, "createdAt_desc")).toBeNull();
    // The same payload is a VALID name cursor (names are free text).
    expect(decodeCursor(bad, "name_asc")).toEqual({ kind: "name", value: "not-a-date", id: "c1" });
  });
});
