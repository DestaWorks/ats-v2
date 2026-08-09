/**
 * Client Discovery specialty dropdown (new domain) — ported verbatim from the legacy reference
 * build's `<optgroup>` list and its `handleClientDiscoverySearch_` `SPECIALTY_MAP` (both in
 * `legacy/Code.gs`), per this project's "preserve behavior during migration" rule (CLAUDE.md #5).
 * Each option's own label doubles as its `<select>` value (legacy has no separate value/label
 * pair here) — that label is what gets sent to NPPES as `taxonomy_description`.
 *
 * NOTE (parity, not a fix): legacy only remaps 5 of these 27 labels to a real NPPES search term
 * (`SPECIALTY_TAXONOMY_QUERY` below); the other 22 send their own literal label straight to NPPES
 * as a loose substring match, which may under-match since NPPES's real taxonomy description text
 * often doesn't literally contain these display labels (e.g. NPPES says "Social Worker, Clinical",
 * not "Clinical Social Worker (LCSW)"). Discover's `TAXONOMY_OPTIONS` (`nppes.ts`) hit this exact
 * class of bug and fixed it with a `matchDesc` exact-equality post-filter (Wave 3.2) — the same
 * fix could be applied here later; this port intentionally matches legacy's current behavior only.
 */

export interface SpecialtyGroup {
  label: string;
  options: readonly string[];
}

export const CLIENT_DISCOVERY_SPECIALTY_GROUPS: readonly SpecialtyGroup[] = [
  { label: "Umbrella", options: ["Behavioral Health", "All Mental Health"] },
  {
    label: "Psychiatric Prescribing",
    options: [
      "Psychiatry",
      "Child & Adolescent Psychiatry",
      "Addiction Psychiatry",
      "Geriatric Psychiatry",
      "Forensic Psychiatry",
      "Behavioral Neurology & Neuropsychiatry",
      "Neurology",
    ],
  },
  {
    label: "Psychiatric Nursing",
    options: ["Psychiatric NP (PMHNP)", "Psychiatric Mental Health CNS"],
  },
  {
    label: "Psychology",
    options: [
      "Clinical Psychology",
      "Counseling Psychology",
      "Neuropsychology",
      "School Psychology",
    ],
  },
  {
    label: "Counseling & Therapy",
    options: [
      "Mental Health Counselor (LMHC)",
      "Professional Counselor (LPC)",
      "Marriage & Family Therapist (LMFT)",
      "Pastoral Counselor",
      "Addiction / SUD Counselor",
    ],
  },
  {
    label: "Social Work",
    options: ["Clinical Social Worker (LCSW)", "Social Worker (LSW/LMSW)"],
  },
  { label: "Behavior Analysis", options: ["Behavior Analyst (BCBA)"] },
  {
    label: "Facilities & Programs",
    options: [
      "Mental Health Clinic",
      "Community Mental Health Center",
      "Psychiatric Hospital",
      "Substance Abuse Treatment Center",
      "Residential Treatment (Mental Health)",
      "Partial Hospitalization (PHP)",
      "Intensive Outpatient (IOP)",
    ],
  },
  {
    label: "Non-behavioral",
    options: ["Long-term Care", "Primary Care", "Multi-Specialty", "Other Specialty"],
  },
];

export const CLIENT_DISCOVERY_SPECIALTIES: readonly string[] =
  CLIENT_DISCOVERY_SPECIALTY_GROUPS.flatMap((g) => g.options);

export function isClientDiscoverySpecialty(value: string): boolean {
  return CLIENT_DISCOVERY_SPECIALTIES.includes(value);
}

/** Specialty label -> NPPES `taxonomy_description` query. Mirrors `legacy/Code.gs`'s
 *  `SPECIALTY_MAP` exactly — every specialty NOT listed here sends its own label as the query. */
const SPECIALTY_TAXONOMY_QUERY: Readonly<Record<string, string>> = {
  "Behavioral Health": "Behavioral",
  Psychiatry: "Psychiatric",
  "Long-term Care": "Nursing",
  "Multi-Specialty": "Multi-Specialty",
  "Other Specialty": "",
};

/** The NPPES `taxonomy_description` query for a selected specialty (parity with legacy). */
export function specialtyTaxonomyQuery(specialty: string): string {
  return specialty in SPECIALTY_TAXONOMY_QUERY ? SPECIALTY_TAXONOMY_QUERY[specialty]! : specialty;
}
