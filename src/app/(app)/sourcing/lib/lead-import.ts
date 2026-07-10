/**
 * Lead CSV import — pure parsing/mapping (unit-tested; NO fetch/DOM). Fixes the legacy importer's
 * naive `split(",")` (which broke on quoted commas) with an RFC-4180-ish parser; keeps the legacy
 * alias-tolerant header mapping ("Candidate Name"/"Name", "Job Title"/"Credential", …) and its
 * one rule: NAME IS REQUIRED, everything else optional. Free-form cells are sanitized to the
 * server contract (bad emails/URLs → null, status fuzzy-normalized) so a junk cell drops the
 * value, never the whole request. Dedup is SERVER-side.
 */
import { LEAD_STATUSES, type LeadStatus } from "@/lib/constants";
import type { ImportLeadRow } from "@/lib/validation/lead";

/** Parse CSV text into rows of cells (handles quoted cells, embedded commas/quotes/newlines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  // Drop fully-empty trailing rows (a final newline is not a row).
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Legacy header aliases, lowercased → canonical field. */
const HEADER_ALIASES: Record<string, keyof ImportLeadRow> = {
  "candidate name": "name",
  name: "name",
  "linkedin url": "linkedinUrl",
  linkedinurl: "linkedinUrl",
  linkedin: "linkedinUrl",
  "job title": "credential",
  credential: "credential",
  title: "credential",
  source: "source",
  client: "clientName",
  targetclient: "clientName",
  "target client": "clientName",
  status: "status",
  state: "state",
  "phone number": "phone",
  phone: "phone",
  emails: "email",
  email: "email",
  notes: "notes",
  city: "notes", // legacy sheet had City with no lead field — folded into notes
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Fuzzy status normalization (legacy `normalizeStatus` parity). Unknown → "Sourced". */
export function normalizeImportStatus(raw: string): LeadStatus {
  const v = raw.trim().toLowerCase();
  if (!v || v === "new" || v.includes("sourc")) return "Sourced";
  const outreach = /outreach\s*([1-3])/.exec(v);
  // The third step's canonical label carries the "(Final)" suffix — a bare "Outreach 3" would
  // fail the server's LEAD_STATUSES enum and reject the whole chunk.
  if (outreach) {
    return outreach[1] === "3" ? "Outreach 3 (Final)" : (`Outreach ${outreach[1]}` as LeadStatus);
  }
  if (v.includes("respond")) return v.includes("cold") ? "Responded — Cold" : "Responded — Hot";
  if (v.includes("hot")) return "Responded — Hot";
  if (v.includes("cold")) return "Responded — Cold";
  if (v.includes("promot") || v.includes("hire") || v.includes("placed")) return "Promoted";
  const exact = (LEAD_STATUSES as readonly string[]).find((s) => s.toLowerCase() === v);
  return (exact as LeadStatus) ?? "Sourced";
}

/**
 * Map parsed CSV rows (header row first) to server-contract `ImportLeadRow`s. Rows without a
 * name are DROPPED (legacy parity — the only per-row requirement); returns the kept rows plus
 * the dropped count so the preview can report honestly.
 */
export function mapCsvToLeadRows(rows: string[][]): { rows: ImportLeadRow[]; dropped: number } {
  if (rows.length < 2) return { rows: [], dropped: 0 };
  const headers = rows[0]!.map((h) => HEADER_ALIASES[h.trim().toLowerCase()] ?? null);
  let dropped = 0;
  const out: ImportLeadRow[] = [];
  for (const cells of rows.slice(1)) {
    const raw: Partial<Record<keyof ImportLeadRow, string>> = {};
    headers.forEach((field, i) => {
      const value = (cells[i] ?? "").trim();
      if (!field || !value) return;
      // Multiple columns can fold into notes (e.g. City) — join rather than overwrite.
      raw[field] = raw[field] ? `${raw[field]} · ${value}` : value;
    });
    if (!raw.name) {
      dropped++;
      continue;
    }
    const email = raw.email?.split(/[;,\s]+/)[0]; // "Emails" column may hold several — first wins
    out.push({
      name: raw.name.slice(0, 200),
      email: email && EMAIL_RE.test(email) ? email.slice(0, 200) : null,
      phone: raw.phone ? raw.phone.slice(0, 50) : null,
      linkedinUrl:
        raw.linkedinUrl && /^https?:\/\//.test(raw.linkedinUrl)
          ? raw.linkedinUrl.slice(0, 500)
          : null,
      credential: raw.credential ? raw.credential.slice(0, 120) : null,
      state: raw.state ? raw.state.slice(0, 60) : null,
      source: raw.source ? raw.source.slice(0, 120) : null,
      notes: raw.notes ? raw.notes.slice(0, 5000) : null,
      clientName: raw.clientName ? raw.clientName.slice(0, 200) : null,
      status: raw.status ? normalizeImportStatus(raw.status) : undefined,
    });
  }
  return { rows: out, dropped };
}
