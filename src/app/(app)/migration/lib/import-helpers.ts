import type { ImportFormat } from "@/lib/validation/migration";
import type { ImportReport, ImportRowReport } from "@/lib/validation/migration";

/**
 * Pure client-side helpers for the bulk-import wizard. No I/O, no server imports — unit-tested
 * in isolation (the Vitest env is node; component-render tests are out of scope).
 */

/** Actions that mean "this row will be written" — the count the Commit button acts on. */
const IMPORTABLE_ACTIONS: ReadonlySet<ImportRowReport["action"]> = new Set([
  "add",
  "update",
  "softDelete",
  "flag",
]);

/**
 * Detect the upload format from the filename extension first (authoritative), falling back to a
 * cheap content sniff (a leading `[` or `{` → JSON, else CSV). Defaults to CSV — the primary input
 * per design E-1. `content` is optional so a bare filename still resolves.
 */
export function detectFormat(filename: string, content = ""): ImportFormat {
  const lower = filename.toLowerCase().trim();
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".csv")) return "csv";

  const trimmed = content.trimStart();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) return "json";
  return "csv";
}

/**
 * The number of rows Commit will write: rows whose action ∈ {add, update, softDelete, flag},
 * excluding `error` (blocked) and `skip` (duplicate legacy_id within the same file). This is the
 * "N" on the "Commit N candidates" button.
 */
export function importableCount(report: ImportReport): number {
  return report.rows.reduce((n, row) => (IMPORTABLE_ACTIONS.has(row.action) ? n + 1 : n), 0);
}
