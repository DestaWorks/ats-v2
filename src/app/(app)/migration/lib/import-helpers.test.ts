import { describe, expect, it } from "vitest";
import type { ImportReport, ImportRowReport } from "@/lib/validation/migration";
import { detectFormat, importableCount } from "./import-helpers";

function row(action: ImportRowReport["action"]): ImportRowReport {
  return { legacyId: "L1", name: "Test", action, reasons: [] };
}

function report(rows: ImportRowReport[]): ImportReport {
  return {
    counts: { added: 0, updated: 0, softDeleted: 0, skipped: 0, flagged: 0, errored: 0 },
    rows,
    emailDuplicateGroups: [],
    checksum: "0".repeat(64),
  };
}

describe("detectFormat", () => {
  it("uses the filename extension (case-insensitive)", () => {
    expect(detectFormat("export.csv")).toBe("csv");
    expect(detectFormat("export.json")).toBe("json");
    expect(detectFormat("EXPORT.JSON")).toBe("json");
    expect(detectFormat("Legacy Candidates.CSV")).toBe("csv");
  });

  it("falls back to a content sniff when the extension is missing/unknown", () => {
    expect(detectFormat("export.txt", '[{"ID":"1"}]')).toBe("json");
    expect(detectFormat("export", '  { "headers": [] }')).toBe("json");
    expect(detectFormat("export.txt", "ID,Name,Status\n1,Jo,New")).toBe("csv");
  });

  it("prefers the extension over the content sniff", () => {
    // JSON-looking content but a .csv name → trust the extension.
    expect(detectFormat("weird.csv", "[not really json")).toBe("csv");
  });

  it("defaults to csv (the primary input) with no signal", () => {
    expect(detectFormat("")).toBe("csv");
    expect(detectFormat("noext", "")).toBe("csv");
  });
});

describe("importableCount", () => {
  it("counts add/update/softDelete and excludes error/skip", () => {
    const r = report([row("add"), row("update"), row("softDelete"), row("error"), row("skip")]);
    expect(importableCount(r)).toBe(3);
  });

  it("is 0 when every row errors or skips", () => {
    expect(importableCount(report([row("error"), row("skip")]))).toBe(0);
  });

  it("is 0 for an empty report", () => {
    expect(importableCount(report([]))).toBe(0);
  });
});
