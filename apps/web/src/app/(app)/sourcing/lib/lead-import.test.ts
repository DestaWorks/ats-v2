import { describe, expect, it } from "vitest";
import { utils as xlsxUtils, write as writeWorkbook } from "@e965/xlsx";
import { mapCsvToLeadRows, normalizeImportStatus, parseCsv, parseXlsx } from "./lead-import";

describe("parseCsv", () => {
  it("handles quoted cells with embedded commas and escaped quotes", () => {
    const text = 'Name,Notes\n"Doe, Jane","said ""maybe"" on Tue"\nBob,plain';
    expect(parseCsv(text)).toEqual([
      ["Name", "Notes"],
      ["Doe, Jane", 'said "maybe" on Tue'],
      ["Bob", "plain"],
    ]);
  });

  it("handles CRLF and a trailing newline without a phantom row", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("normalizeImportStatus", () => {
  it("fuzzy-normalizes the legacy vocab", () => {
    expect(normalizeImportStatus("new")).toBe("Sourced");
    expect(normalizeImportStatus("Outreach 2")).toBe("Outreach 2");
    expect(normalizeImportStatus("outreach 3")).toBe("Outreach 3 (Final)"); // enum has the suffix
    expect(normalizeImportStatus("responded cold")).toBe("Responded — Cold");
    expect(normalizeImportStatus("HOT")).toBe("Responded — Hot");
    expect(normalizeImportStatus("placed")).toBe("Promoted");
    expect(normalizeImportStatus("garbage")).toBe("Sourced");
  });

  // Legacy parity gap fixed 2026-08-08: these three shorthand values previously fell through to
  // "Sourced" instead of their real status (`legacy/index.html`'s minified `normalizeStatus`).
  it("recognizes the legacy shorthand for No Response / Bad Fit / Future Collaboration", () => {
    expect(normalizeImportStatus("no resp")).toBe("No Response");
    expect(normalizeImportStatus("No Resp.")).toBe("No Response");
    expect(normalizeImportStatus("bad")).toBe("Bad Fit");
    expect(normalizeImportStatus("not a fit")).toBe("Bad Fit");
    expect(normalizeImportStatus("future")).toBe("Future Collaboration");
    expect(normalizeImportStatus("responded, not interested")).toBe("Responded — Cold");
  });

  it("matches legacy's loose outreach-number detection (no space/hyphen required)", () => {
    expect(normalizeImportStatus("Outreach")).toBe("Outreach 1"); // bare, no digit
    expect(normalizeImportStatus("Outreach - 2")).toBe("Outreach 2");
    expect(normalizeImportStatus("2nd Outreach")).toBe("Outreach 2");
  });
});

describe("mapCsvToLeadRows", () => {
  it("maps legacy alias headers, sanitizes junk cells, drops nameless rows", () => {
    const rows = parseCsv(
      [
        "Candidate Name,LinkedIn URL,Job Title,Source,Client,Status,City,State,Phone Number,Emails,Notes",
        'Jane Doe,https://x.com/in/jd,PMHNP,LinkedIn,Acme,outreach 1,Trenton,NJ,555-0100,"jane@x.com; alt@x.com",solid',
        ",,,LinkedIn,,,,,,,no name here",
        "Bob,not-a-url,LCSW,,,new,,,,bad-email,",
      ].join("\n"),
    );
    const { rows: mapped, dropped } = mapCsvToLeadRows(rows);
    expect(dropped).toBe(1);
    expect(mapped).toHaveLength(2);
    expect(mapped[0]).toMatchObject({
      name: "Jane Doe",
      linkedinUrl: "https://x.com/in/jd",
      credential: "PMHNP",
      source: "LinkedIn",
      clientName: "Acme",
      status: "Outreach 1",
      state: "NJ",
      phone: "555-0100",
      email: "jane@x.com", // first of several; second discarded
      notes: "Trenton · solid", // City folded into notes
    });
    // Junk URL/email cells drop the VALUE, never the row.
    expect(mapped[1]).toMatchObject({
      name: "Bob",
      linkedinUrl: null,
      email: null,
      status: "Sourced",
    });
  });

  it("returns empty for header-only input", () => {
    expect(mapCsvToLeadRows(parseCsv("Name,Email"))).toEqual({ rows: [], dropped: 0 });
  });

  // Legacy parity gap fixed 2026-08-08: legacy folded "Outreach - Mike"/"Outreach - Farhaz"
  // columns into a pre-populated outreach history; the generalized `OUTREACH_COLUMN_RE` reads the
  // rep name from the header itself rather than hardcoding those two names.
  it("folds non-empty 'Outreach - <Rep>' columns into priorOutreachNotes, one entry per rep", () => {
    const rows = parseCsv(
      [
        "Name,Outreach - Mike,Outreach - Farhaz,Outreach - Priya",
        'Jane Doe,"no response yet",,"replied, interested"',
        "Bob,,,",
      ].join("\n"),
    );
    const { rows: mapped } = mapCsvToLeadRows(rows);
    expect(mapped[0]).toMatchObject({
      name: "Jane Doe",
      priorOutreachNotes: ["Mike: no response yet", "Priya: replied, interested"],
    });
    // No non-empty outreach cells → the field is omitted entirely (not an empty array).
    expect(mapped[1]).toMatchObject({ name: "Bob", priorOutreachNotes: undefined });
  });
});

describe("parseXlsx", () => {
  it("parses a workbook's first sheet into the same string[][] shape parseCsv produces", () => {
    const sheet = xlsxUtils.aoa_to_sheet([
      ["Name", "Status"],
      ["Jane Doe", "outreach 1"],
    ]);
    const workbook = xlsxUtils.book_new();
    xlsxUtils.book_append_sheet(workbook, sheet, "Sheet1");
    const buffer = writeWorkbook(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

    expect(parseXlsx(buffer)).toEqual([
      ["Name", "Status"],
      ["Jane Doe", "outreach 1"],
    ]);
  });

  it("round-trips through mapCsvToLeadRows exactly like a CSV would", () => {
    const sheet = xlsxUtils.aoa_to_sheet([
      ["Candidate Name", "Job Title"],
      ["Bob", "LCSW"],
    ]);
    const workbook = xlsxUtils.book_new();
    xlsxUtils.book_append_sheet(workbook, sheet, "Sheet1");
    const buffer = writeWorkbook(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

    const { rows } = mapCsvToLeadRows(parseXlsx(buffer));
    expect(rows).toEqual([
      expect.objectContaining({ name: "Bob", credential: "LCSW", status: undefined }),
    ]);
  });
});
