import { describe, it, expect } from "vitest";
import { AppError } from "@/server/http/app-error";
import { parseSheet } from "./sheet-parse";

/**
 * Pure sheet parsing (Wave 1.3 §1). CSV goes through papaparse (quote/BOM/CRLF-safe); JSON through
 * JSON.parse. Both normalize onto the 32 canonical keys, tolerant to header whitespace/case. Missing
 * a required header (ID/Name/Status) or invalid JSON → BAD_REQUEST.
 */

describe("parseSheet — CSV", () => {
  it("parses a header row, handles quoted fields with embedded commas, and strips a BOM", () => {
    const csv =
      "﻿ID,Name,Status,Tags\r\n" + `L-1,"Doe, Jane",0 - New Candidate,"Priority, Bilingual"\r\n`;
    const { rows } = parseSheet(csv, "csv");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      ID: "L-1",
      Name: "Doe, Jane",
      Status: "0 - New Candidate",
      Tags: "Priority, Bilingual",
    });
    // absent columns are present as empty strings
    expect(rows[0]!.Email).toBe("");
  });

  it("is tolerant to header whitespace and case", () => {
    const csv = " id , name , STATUS \nL-2,Jane,0 - New Candidate\n";
    const { rows } = parseSheet(csv, "csv");
    expect(rows[0]).toMatchObject({ ID: "L-2", Name: "Jane", Status: "0 - New Candidate" });
  });

  it("rejects a file missing a required header", () => {
    expect(() => parseSheet("Name,Status\nJane,0 - New Candidate\n", "csv")).toThrow(AppError);
  });
});

describe("parseSheet — JSON", () => {
  it("accepts an array of header-keyed objects", () => {
    const json = JSON.stringify([{ ID: "L-3", Name: "Jane", Status: "0 - New Candidate" }]);
    const { rows } = parseSheet(json, "json");
    expect(rows[0]).toMatchObject({ ID: "L-3", Name: "Jane" });
  });

  it("accepts a { headers, rows } positional shape", () => {
    const json = JSON.stringify({
      headers: ["ID", "Name", "Status"],
      rows: [["L-4", "Jane", "0 - New Candidate"]],
    });
    const { rows } = parseSheet(json, "json");
    expect(rows[0]).toMatchObject({ ID: "L-4", Name: "Jane", Status: "0 - New Candidate" });
  });

  it("throws BAD_REQUEST on invalid JSON", () => {
    expect(() => parseSheet("{not json", "json")).toThrow(AppError);
  });
});
