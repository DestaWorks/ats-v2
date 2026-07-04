/**
 * Legacy Sheet export → normalized rows (Wave 1.3, E-1). PURE (no `server-only`, no DB) so it
 * unit-tests cleanly. CSV goes through `papaparse` (quote/BOM/CRLF-safe — a naive `split(",")`
 * silently corrupts quoted fields with embedded commas/newlines, unacceptable for a PII migration);
 * JSON goes through native `JSON.parse`. Both normalize to a `LegacyRow` with all 32 canonical keys
 * present as strings, tolerant to header whitespace/case.
 */
import Papa from "papaparse";
import type { ImportFormat } from "@/lib/validation/migration";
import { AppError } from "@/server/http/app-error";

/** The 32 legacy candidate columns, in Sheet order — the canonical keys of a `LegacyRow`. */
export const LEGACY_COLUMNS = [
  "ID",
  "Name",
  "Credential",
  "LicenseState",
  "LicenseNumber",
  "LicenseStatus",
  "LicenseExpiry",
  "LicenseVerifiedBy",
  "LicenseVerifiedAt",
  "Client",
  "Source",
  "Status",
  "Email",
  "Phone",
  "City",
  "State",
  "Population",
  "Setting",
  "TelehealthPref",
  "YearsExp",
  "Employer",
  "Tags",
  "AddedBy",
  "AddedAt",
  "UpdatedAt",
  "OutreachAttempts",
  "Track",
  "DeletedAt",
  "DeletedBy",
  "ResumeFileID",
  "ResumeURL",
  "ResumeFilename",
] as const;

export type LegacyColumn = (typeof LEGACY_COLUMNS)[number];

/** A normalized legacy row — every canonical column present (missing/absent → ""), values trimmed. */
export type LegacyRow = Record<LegacyColumn, string>;

/** Required headers — a file missing any is rejected before any row transform (fail-fast). */
const REQUIRED_HEADERS = ["ID", "Name", "Status"] as const;

const normalizeHeader = (h: string) => h.trim().toLowerCase();

/** Throw `BAD_REQUEST` if any required header is absent (case-insensitive, trimmed). */
function assertRequiredHeaders(fields: string[]): void {
  const present = new Set(fields.map(normalizeHeader));
  const missing = REQUIRED_HEADERS.filter((h) => !present.has(normalizeHeader(h)));
  if (missing.length > 0) {
    throw new AppError("BAD_REQUEST", `Missing required column(s): ${missing.join(", ")}`);
  }
}

/** Map an arbitrary-cased/whitespaced raw record onto the 32 canonical keys (unknown keys ignored). */
function toLegacyRow(raw: Record<string, unknown>): LegacyRow {
  const byLower = new Map<string, string>();
  for (const [key, value] of Object.entries(raw)) {
    byLower.set(normalizeHeader(key), value == null ? "" : String(value));
  }
  const row = {} as LegacyRow;
  for (const col of LEGACY_COLUMNS) {
    row[col] = (byLower.get(normalizeHeader(col)) ?? "").trim();
  }
  return row;
}

function parseCsv(content: string): { rows: LegacyRow[]; parseErrors: string[] } {
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  assertRequiredHeaders(result.meta.fields ?? []);
  const parseErrors = result.errors.map((e) => `row ${e.row ?? "?"}: ${e.message}`);
  return { rows: result.data.map(toLegacyRow), parseErrors };
}

function parseJson(content: string): { rows: LegacyRow[]; parseErrors: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new AppError("BAD_REQUEST", "Invalid JSON");
  }

  let objects: Record<string, unknown>[];
  if (Array.isArray(parsed)) {
    objects = parsed as Record<string, unknown>[];
  } else if (parsed && typeof parsed === "object" && "rows" in parsed) {
    // { headers, rows } shape — rows may be arrays (positional) or header-keyed objects.
    const { headers, rows } = parsed as { headers?: string[]; rows?: unknown };
    if (!Array.isArray(rows))
      throw new AppError("BAD_REQUEST", "Invalid JSON: `rows` is not an array");
    objects = rows.map((r) =>
      Array.isArray(r) && headers
        ? Object.fromEntries(headers.map((h, i) => [h, r[i]]))
        : (r as Record<string, unknown>),
    );
  } else {
    throw new AppError("BAD_REQUEST", "Invalid JSON: expected an array or { headers, rows }");
  }

  const fields = objects.length > 0 ? Object.keys(objects[0]!) : [];
  assertRequiredHeaders(fields);
  return { rows: objects.map(toLegacyRow), parseErrors: [] };
}

/**
 * Parse a legacy Sheet export into normalized rows. `parseErrors` are advisory (papaparse row
 * issues); fatal problems (bad JSON, missing required headers) throw `AppError("BAD_REQUEST")`.
 */
export function parseSheet(
  content: string,
  format: ImportFormat,
): { rows: LegacyRow[]; parseErrors: string[] } {
  return format === "json" ? parseJson(content) : parseCsv(content);
}
