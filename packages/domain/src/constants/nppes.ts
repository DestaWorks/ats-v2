/**
 * NPPES search vocab (Wave 2.7, Discover) — a curated provider-type dropdown mapped to real NPPES
 * `taxonomy_description` search phrases. Isomorphic (the client `<select>` needs the labels too).
 * Fixes a real legacy bug (`legacy/index.html:3979`) where two different taxonomy rows shared one
 * code — each entry here has its own distinct `value`.
 *
 * **`query`/`matchDesc` corrected 2026-07-16 (Wave 3.2)** — discovered while building Smarter
 * Sourcing that 5 of the original 8 `query` values (`child_psychiatry`/`pmhnp`/`clinical_psych`/
 * `lcsw`/`counselor`) had ALWAYS errored against the real NPPES API ("No taxonomy codes found with
 * entered description") — a live bug in Discover since it shipped, not something this PR
 * introduced. Verified against real NPPES responses (not guessed): the API's `taxonomy_description`
 * param only accepts an EXACT single classification or specialization segment (e.g. "Nurse
 * Practitioner" or "Psych/Mental Health") — never the comma-joined "Classification, Specialization"
 * display string every option originally used. Worse, even a query that doesn't error can still be
 * loose/fuzzy (e.g. "Clinical" alone also surfaces neurologists, geneticists, and nurse
 * specialists) — so `matchDesc` is a required exact-equality post-filter against each real
 * result's own taxonomy description, applied in `discoverService.search`/`similarityService`,
 * never trusting the NPPES query alone for precision.
 */

export interface TaxonomyOption {
  value: string;
  label: string;
  /** The `taxonomy_description` search phrase sent to NPPES — a verified-working seed, NOT
   *  necessarily the exact profession (NPPES's search is loose; see `matchDesc`). */
  query: string;
  /** The EXACT real NPPES taxonomy description this option targets. Results are kept only when
   *  their own `taxonomyDesc` equals this — the actual precision boundary, not `query`. */
  matchDesc: string;
  /** Best-guess candidate credential for a result under this taxonomy (display only). */
  credential: string;
}

export const TAXONOMY_OPTIONS: readonly TaxonomyOption[] = [
  {
    value: "psychiatry",
    label: "Psychiatry (MD/DO)",
    query: "Psychiatry",
    matchDesc: "Psychiatry & Neurology, Psychiatry",
    credential: "MD",
  },
  {
    value: "child_psychiatry",
    label: "Child & Adolescent Psychiatry",
    query: "Child & Adolescent Psychiatry",
    matchDesc: "Psychiatry & Neurology, Child & Adolescent Psychiatry",
    credential: "MD",
  },
  {
    value: "pmhnp",
    label: "Psychiatric NP (PMHNP)",
    query: "Psych/Mental Health",
    matchDesc: "Nurse Practitioner, Psych/Mental Health",
    credential: "PMHNP",
  },
  {
    value: "np",
    label: "Nurse Practitioner",
    query: "Nurse Practitioner",
    matchDesc: "Nurse Practitioner",
    credential: "NP",
  },
  {
    value: "clinical_psych",
    label: "Clinical Psychologist",
    query: "Clinical",
    matchDesc: "Psychologist, Clinical",
    credential: "PsyD",
  },
  {
    value: "lcsw",
    label: "Clinical Social Worker",
    query: "Social Worker",
    matchDesc: "Social Worker, Clinical",
    credential: "LCSW",
  },
  {
    value: "lmft",
    label: "Marriage & Family Therapist",
    query: "Marriage & Family Therapist",
    matchDesc: "Marriage & Family Therapist",
    credential: "LMFT",
  },
  {
    value: "counselor",
    label: "Mental Health Counselor",
    query: "Mental Health",
    matchDesc: "Counselor, Mental Health",
    credential: "LMHC",
  },
] as const;

/**
 * The verified NPPES taxonomy option for a candidate's credential (Wave 3.2, Smarter Sourcing) —
 * `null` when the credential has no verified `taxonomy_description` phrase yet (13 of the 20
 * `CREDENTIALS` values aren't covered; deliberately NOT guessed/fabricated here, since a wrong
 * phrase either matches nothing or matches the wrong profession). Callers should treat `null` as
 * "similarity search unavailable for this credential," not silently fall back to a raw query.
 */
export function taxonomyForCredential(credential: string | null): TaxonomyOption | null {
  if (!credential) return null;
  return TAXONOMY_OPTIONS.find((t) => t.credential === credential) ?? null;
}
