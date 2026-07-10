import { describe, expect, it } from "vitest";
import { mapCsvToLeadRows, normalizeImportStatus, parseCsv } from "./lead-import";

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
});
