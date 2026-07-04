import "server-only";
import type { ResumeData, ResumeMatch } from "@/lib/validation/resume";

/**
 * Résumé → existing-candidate matching (Wave 1.2 §5). Pure + unit-tested. Enforces the
 * no-silent-wrong-person-merge invariant: an email-exact hit is `auto` (the UI pre-selects but
 * the user still accepts), a name-fuzzy-only hit is `confirm` (requires an explicit toggle), and
 * anything below threshold is `none` (save creates a NEW candidate). This runs SERVER-SIDE on
 * both extract and save — the client's match is never trusted.
 */

/** Normalized name-similarity threshold for a `confirm` match (tunable). */
export const NAME_MATCH_THRESHOLD = 0.9;

/** The minimal candidate shape matching needs. */
export interface MatchCandidate {
  id: string;
  name: string;
  email: string | null;
}

/** Per-candidate classification (auto = email-exact, confirm = name-fuzzy, none = neither). */
export type MatchClass = "auto" | "confirm" | "none";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Lowercase, collapse punctuation/whitespace to single spaces. */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Levenshtein edit distance between two strings. */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n]!;
}

/** Normalized similarity ratio in [0,1] (1 = identical). */
function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  return 1 - levenshtein(a, b) / maxLen;
}

/**
 * Classify a single candidate against the extracted résumé. Email-exact (case/space-insensitive)
 * wins as `auto`; otherwise a name-similarity ≥ threshold (with NO email match) is `confirm`;
 * everything else is `none`.
 */
export function classifyMatch(data: ResumeData, candidate: MatchCandidate): MatchClass {
  const resumeEmail = data.email ? normalizeEmail(data.email) : "";
  const candidateEmail = candidate.email ? normalizeEmail(candidate.email) : "";
  if (resumeEmail && candidateEmail && resumeEmail === candidateEmail) return "auto";

  const ratio = nameSimilarity(normalizeName(data.name), normalizeName(candidate.name));
  if (ratio >= NAME_MATCH_THRESHOLD) return "confirm";
  return "none";
}

/**
 * Find the best match across the (non-deleted) candidate list. Any email-exact hit short-circuits
 * to `auto`; otherwise the highest-scoring name-fuzzy hit at/above threshold is `confirm`; no
 * signal is `none`.
 */
export function matchResumeToCandidate(
  data: ResumeData,
  candidates: readonly MatchCandidate[],
): ResumeMatch {
  const resumeEmail = data.email ? normalizeEmail(data.email) : "";
  const resumeName = normalizeName(data.name);

  let bestConfirm: { candidate: MatchCandidate; score: number } | null = null;

  for (const candidate of candidates) {
    const candidateEmail = candidate.email ? normalizeEmail(candidate.email) : "";
    if (resumeEmail && candidateEmail && resumeEmail === candidateEmail) {
      return {
        status: "auto",
        candidateId: candidate.id,
        candidateName: candidate.name,
        score: 1,
        reason: "email-exact",
      };
    }
    const score = nameSimilarity(resumeName, normalizeName(candidate.name));
    if (score >= NAME_MATCH_THRESHOLD && (!bestConfirm || score > bestConfirm.score)) {
      bestConfirm = { candidate, score };
    }
  }

  if (bestConfirm) {
    return {
      status: "confirm",
      candidateId: bestConfirm.candidate.id,
      candidateName: bestConfirm.candidate.name,
      score: bestConfirm.score,
      reason: "name-fuzzy",
    };
  }

  return { status: "none", score: 0 };
}
