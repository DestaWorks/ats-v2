/**
 * NPPES search vocab (Wave 2.7, Discover) — a curated provider-type dropdown mapped to real NPPES
 * `taxonomy_description` search phrases. Isomorphic (the client `<select>` needs the labels too).
 * Fixes a real legacy bug (`legacy/index.html:3979`) where two different taxonomy rows shared one
 * code — each entry here has its own distinct `value`.
 */

export interface TaxonomyOption {
  value: string;
  label: string;
  /** The `taxonomy_description` search phrase sent to NPPES (partial match). */
  query: string;
  /** Best-guess candidate credential for a result under this taxonomy (display only). */
  credential: string;
}

export const TAXONOMY_OPTIONS: readonly TaxonomyOption[] = [
  { value: "psychiatry", label: "Psychiatry (MD/DO)", query: "Psychiatry", credential: "MD" },
  {
    value: "child_psychiatry",
    label: "Child & Adolescent Psychiatry",
    query: "Psychiatry & Neurology, Child",
    credential: "MD",
  },
  {
    value: "pmhnp",
    label: "Psychiatric NP (PMHNP)",
    query: "Psychiatric/Mental Health, Nurse Practitioner",
    credential: "PMHNP",
  },
  { value: "np", label: "Nurse Practitioner", query: "Nurse Practitioner", credential: "NP" },
  {
    value: "clinical_psych",
    label: "Clinical Psychologist",
    query: "Psychologist, Clinical",
    credential: "PsyD",
  },
  {
    value: "lcsw",
    label: "Clinical Social Worker",
    query: "Social Worker, Clinical",
    credential: "LCSW",
  },
  {
    value: "lmft",
    label: "Marriage & Family Therapist",
    query: "Marriage & Family Therapist",
    credential: "LMFT",
  },
  {
    value: "counselor",
    label: "Mental Health Counselor",
    query: "Counselor, Mental Health",
    credential: "LMHC",
  },
] as const;
export type TaxonomyValue = (typeof TAXONOMY_OPTIONS)[number]["value"];
