import type { LeadStatus } from "@/lib/constants";

/**
 * Normalize a free-text lead status (from imports / legacy data) to a canonical
 * `LeadStatus` (ported verbatim from legacy `normalizeStatus`). Used by the bulk importer.
 *
 * Substring rules, evaluated in order; anything unrecognized falls back to "Sourced".
 */
export function normalizeLeadStatus(raw: string | null | undefined): LeadStatus {
  const x = (raw ?? "").toString().trim().toLowerCase();

  if (!x || x === "new candidate" || x === "new") return "Sourced";

  if (x.includes("outreach")) {
    if (x.includes("3") || x.includes("final")) return "Outreach 3 (Final)";
    if (x.includes("2")) return "Outreach 2";
    return "Outreach 1";
  }

  if (x.includes("respond")) {
    if (x.includes("cold") || x.includes("not interested")) return "Responded — Cold";
    return "Responded — Hot";
  }

  if (x.includes("no resp")) return "No Response";
  if (x.includes("bad") || x.includes("not a fit")) return "Bad Fit";
  if (x.includes("future")) return "Future Collaboration";
  if (x.includes("hire") || x.includes("promot") || x.includes("placed")) return "Promoted";

  return "Sourced";
}
