/**
 * Best-effort, DISPLAY-ONLY lookup of one CSV/JSON row by legacy ID — for the row-inspect modal
 * (legacy parity: "click any row to inspect the CSV data ... before committing"). Never used for
 * commit logic — that stays server-side in `sheet-parse.ts`, the single source of truth for what
 * actually gets written. If a row can't be found here, the modal just shows nothing rather than
 * blocking anything.
 */
import Papa from "papaparse";
import type { ImportFormat } from "@/lib/validation/migration";

const DISPLAY_FIELDS = [
  "Name",
  "Email",
  "Phone",
  "City",
  "State",
  "Credential",
  "Client",
  "Source",
  "Status",
  "Track",
] as const;

export type RawRowDisplay = Partial<Record<(typeof DISPLAY_FIELDS)[number], string>>;

const normalize = (h: string) => h.trim().toLowerCase();

function recordsFrom(content: string, format: ImportFormat): Record<string, unknown>[] {
  if (format === "csv") {
    const result = Papa.parse<Record<string, string>>(content, {
      header: true,
      skipEmptyLines: "greedy",
    });
    return result.data;
  }
  try {
    const parsed: unknown = JSON.parse(content);
    return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
  } catch {
    return [];
  }
}

export function findRawRow(
  content: string,
  format: ImportFormat,
  legacyId: string,
): RawRowDisplay | null {
  const records = recordsFrom(content, format);
  const match = records.find((r) => {
    const idKey = Object.keys(r).find((k) => normalize(k) === "id");
    return idKey && String(r[idKey] ?? "").trim() === legacyId;
  });
  if (!match) return null;

  const byLower = new Map<string, string>();
  for (const [k, v] of Object.entries(match)) byLower.set(normalize(k), v == null ? "" : String(v));

  const out: RawRowDisplay = {};
  for (const field of DISPLAY_FIELDS) {
    const v = byLower.get(normalize(field));
    if (v) out[field] = v;
  }
  return out;
}
