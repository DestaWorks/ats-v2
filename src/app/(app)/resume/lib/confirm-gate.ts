import type { ResumeMatch } from "@/lib/validation/resume";

/**
 * Client-side confirm gate for the résumé → candidate match (Wave 1.2, design §7).
 *
 * This is the UI half of the no-silent-wrong-person-merge invariant (the server
 * re-runs `matchResumeToCandidate` and is the real authority — see design §5).
 *
 *   - `auto`    — email-exact. Email is a dedupe key (D-8); the server ALWAYS attaches on an
 *                 email match, so the UI shows this pre-checked + disabled (not a decline toggle).
 *   - `confirm` — name-fuzzy. NOT pre-selected; attaches ONLY if the user ticks the box.
 *   - `none`    — no signal. Never attaches; Save always creates a new candidate.
 */

/** Whether Save should attach to the matched candidate (i.e. send `confirmedCandidateId`). */
export function canAttach(match: ResumeMatch, confirmed: boolean): boolean {
  switch (match.status) {
    case "auto":
      return true; // email-exact dedupe — the server attaches regardless; not user-declinable
    case "confirm":
      return confirmed; // name-fuzzy — requires an explicit user tick
    case "none":
      return false;
  }
}

/**
 * The `confirmedCandidateId` to put on the save request — `undefined` means "create new".
 * `none` has no candidate id, so it can never leak one even if `confirmed` is forced true.
 */
export function confirmedCandidateIdFor(
  match: ResumeMatch,
  confirmed: boolean,
): string | undefined {
  if (match.status === "none") return undefined;
  return canAttach(match, confirmed) ? match.candidateId : undefined;
}

/**
 * Initial value for the confirm toggle: `auto` is pre-selected, `confirm`/`none` are not.
 * This is what makes auto "one click to accept" while confirm "requires an explicit tick".
 */
export function defaultConfirmed(match: ResumeMatch): boolean {
  return match.status === "auto";
}
