/**
 * Discover (NPPES) cross-system dedupe classification (Wave 2.7) — PURE + ISOMORPHIC (no
 * `server-only`): unit-tested in isolation, mirrors `lead-lifecycle.ts`'s posture. The service
 * builds the comparison sets from a real DB read; this module only classifies one search result
 * row against those sets — it never touches Prisma.
 *
 * Precedence (matches legacy's `dupOf`, minus its Candidate-NPI branch — this schema has no
 * `Candidate.npi` column, see `discover.service.ts`'s doc comment for why): a candidate NAME match
 * wins over any lead match (a candidate is further down the funnel than a lead), then a lead NPI
 * match, then a lead NAME match (email-less/NPI-less legacy rows), else the row is new.
 */

export type DupStatus = "new" | "in_sourcing" | "in_pipeline";

export interface DupMatch {
  status: DupStatus;
  matchedId: string | null;
  /** The matched row's status label, for the result table's badge (e.g. "Outreach 1", "3 - Screening"). */
  matchedLabel: string | null;
}

interface MatchedRow {
  id: string;
  status: string;
}

export interface DupCandidateSets {
  leadsByNpi: Map<string, MatchedRow>;
  /** Keyed by the trimmed, lowercased full name. */
  leadsByName: Map<string, MatchedRow>;
  candidatesByName: Map<string, MatchedRow>;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/** Classify one NPPES search result row as new, already-sourced, or already-in-pipeline. */
export function classifyDiscoverRow(
  row: { npi: string; fullName: string },
  sets: DupCandidateSets,
): DupMatch {
  const name = normalizeName(row.fullName);

  const candidateMatch = sets.candidatesByName.get(name);
  if (candidateMatch) {
    return {
      status: "in_pipeline",
      matchedId: candidateMatch.id,
      matchedLabel: candidateMatch.status,
    };
  }

  const leadByNpi = sets.leadsByNpi.get(row.npi);
  if (leadByNpi) {
    return { status: "in_sourcing", matchedId: leadByNpi.id, matchedLabel: leadByNpi.status };
  }

  const leadByName = sets.leadsByName.get(name);
  if (leadByName) {
    return { status: "in_sourcing", matchedId: leadByName.id, matchedLabel: leadByName.status };
  }

  return { status: "new", matchedId: null, matchedLabel: null };
}
