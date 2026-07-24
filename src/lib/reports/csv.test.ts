import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("quotes cells containing commas, quotes, or newlines (RFC4180)", () => {
    const csv = toCsv(
      [{ name: 'Jane "JJ" Doe', note: "Line1\nLine2", city: "Austin, TX" }],
      [
        { header: "Name", value: (r) => r.name },
        { header: "Note", value: (r) => r.note },
        { header: "City", value: (r) => r.city },
      ],
    );
    const [, row] = csv.split("\r\n");
    expect(row).toBe('"Jane ""JJ"" Doe","Line1\nLine2","Austin, TX"');
  });

  it("renders null as an empty cell and leaves plain values unquoted", () => {
    const csv = toCsv([{ n: null as string | null }], [{ header: "N", value: (r) => r.n }]);
    expect(csv).toBe("N\r\n");
  });

  it("header row first, CRLF-joined", () => {
    const csv = toCsv([{ a: 1 }, { a: 2 }], [{ header: "A", value: (r) => r.a }]);
    expect(csv).toBe("A\r\n1\r\n2");
  });
});
