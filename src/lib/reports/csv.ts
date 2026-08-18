/**
 * Minimal RFC4180 CSV serialization (Wave 5.2) — no existing CSV-EXPORT precedent anywhere in
 * this app (only CSV-import parsing exists, `sourcing/lib/lead-import.ts`), so this establishes
 * the write direction fresh. Pure — no server imports.
 */

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null;
}

const FORMULA_TRIGGER = /^[=+\-@]/;

function escapeCell(value: string | number | null): string {
  const s = value === null ? "" : String(value);
  const safe = typeof value === "string" && FORMULA_TRIGGER.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Build a CSV string (CRLF line endings, per RFC4180) from rows + a column definition list. */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [columns.map((c) => escapeCell(c.header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCell(c.value(row))).join(","));
  }
  return lines.join("\r\n");
}
