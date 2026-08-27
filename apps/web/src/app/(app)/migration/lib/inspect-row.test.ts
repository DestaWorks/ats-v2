import { describe, it, expect } from "vitest";
import { findRawRow } from "./inspect-row";

const CSV = [
  "ID,Name,Email,State",
  "L-1,Jane Carter,jane@x.com,TX",
  "L-2,Michael Obi,michael@x.com,CA",
].join("\n");

describe("findRawRow", () => {
  it("finds a CSV row by legacy ID and returns only the display fields", () => {
    const row = findRawRow(CSV, "csv", "L-1");
    expect(row).toEqual({ Name: "Jane Carter", Email: "jane@x.com", State: "TX" });
  });

  it("returns null when the legacy ID isn't found", () => {
    expect(findRawRow(CSV, "csv", "L-999")).toBeNull();
  });

  it("finds a JSON array row by legacy ID", () => {
    const json = JSON.stringify([{ ID: "L-1", Name: "Jane Carter", Email: "jane@x.com" }]);
    expect(findRawRow(json, "json", "L-1")).toEqual({ Name: "Jane Carter", Email: "jane@x.com" });
  });

  it("returns null for malformed JSON rather than throwing", () => {
    expect(findRawRow("{not valid json", "json", "L-1")).toBeNull();
  });

  it("is case-insensitive on header names", () => {
    const csv = ["id,name,EMAIL", "L-1,Jane,jane@x.com"].join("\n");
    expect(findRawRow(csv, "csv", "L-1")).toEqual({ Name: "Jane", Email: "jane@x.com" });
  });
});
