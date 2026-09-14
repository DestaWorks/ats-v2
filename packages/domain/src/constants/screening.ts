/**
 * Screening scorecard vocab (Wave 3.3) — DATA, not code, ported verbatim from legacy's
 * `CRED_REQS`/`SALARY_RANGES`/`COMM_ITEMS`/`SCHED_OPTIONS` (`legacy/index.html:6696-6723`).
 * Consumed by the pure `scoreScreening` (`lib/rules/screening.ts`), which takes these as data —
 * same "rules are data, not code" posture as `client_rules`/`scoreCandidate`.
 */

export interface CredentialRequirement {
  label: string;
  required: readonly string[];
  preferred: readonly string[];
  minYears: number;
}

/** Per-credential required/preferred qualifications + minimum years — the Credential (25%) and
 *  Experience (20%) sections score against this. */
export const CRED_REQS: Readonly<Record<string, CredentialRequirement>> = {
  PMHNP: {
    label: "Psychiatric Mental Health Nurse Practitioner",
    required: [
      "Active RN License",
      "PMHNP Certification",
      "NP License",
      "DEA Registration",
      "Collaborative Agreement (if required by state)",
    ],
    preferred: [
      "ANCC Board Certification",
      "Prescriptive Authority",
      "CPR/BLS",
      "Malpractice Insurance",
    ],
    minYears: 2,
  },
  "PMHNP-BC": {
    label: "PMHNP Board Certified",
    required: [
      "Active RN License",
      "PMHNP-BC Certification (ANCC)",
      "NP License",
      "DEA Registration",
      "Prescriptive Authority",
    ],
    preferred: [
      "Collaborative Agreement",
      "CPR/BLS",
      "Malpractice Insurance",
      "State Controlled Substance License",
    ],
    minYears: 2,
  },
  MD: {
    label: "Medical Doctor (Psychiatry)",
    required: [
      "MD Degree",
      "Board Certification (Psychiatry)",
      "Active Medical License",
      "DEA Registration",
      "NPI Number",
    ],
    preferred: [
      "Fellowship Training",
      "Subspecialty Certification",
      "Malpractice Insurance",
      "CPR/BLS",
    ],
    minYears: 3,
  },
  DO: {
    label: "Doctor of Osteopathic Medicine",
    required: [
      "DO Degree",
      "Board Certification",
      "Active Medical License",
      "DEA Registration",
      "NPI Number",
    ],
    preferred: ["Psychiatry Residency", "Malpractice Insurance", "CPR/BLS"],
    minYears: 3,
  },
  LCSW: {
    label: "Licensed Clinical Social Worker",
    required: ["MSW Degree", "LCSW License", "Supervised Clinical Hours (3000+)", "NPI Number"],
    preferred: [
      "ACSW Certification",
      "Telehealth Certification",
      "Malpractice Insurance",
      "CPR/BLS",
    ],
    minYears: 2,
  },
  LPC: {
    label: "Licensed Professional Counselor",
    required: ["Master's in Counseling", "LPC License", "Supervised Hours Complete", "NPI Number"],
    preferred: ["NCC Certification", "Telehealth Certification", "Malpractice Insurance"],
    minYears: 2,
  },
  LMHC: {
    label: "Licensed Mental Health Counselor",
    required: ["Master's Degree", "LMHC License", "Supervised Hours Complete", "NPI Number"],
    preferred: ["Telehealth Certification", "Malpractice Insurance", "Specialty Training"],
    minYears: 2,
  },
  LMFT: {
    label: "Licensed Marriage & Family Therapist",
    required: ["Master's Degree", "LMFT License", "Supervised Hours Complete", "NPI Number"],
    preferred: ["AAMFT Clinical Member", "Telehealth Certification", "Malpractice Insurance"],
    minYears: 2,
  },
  NP: {
    label: "Nurse Practitioner",
    required: ["Active RN License", "NP Certification", "NP License", "DEA Registration"],
    preferred: [
      "Board Certification",
      "Prescriptive Authority",
      "CPR/BLS",
      "Malpractice Insurance",
    ],
    minYears: 2,
  },
};

/** Salary range `[min, max]` per credential — the Salary (10%) section. */
export const SALARY_RANGES: Readonly<Record<string, readonly [number, number]>> = {
  PMHNP: [120000, 165000],
  "PMHNP-BC": [130000, 175000],
  MD: [250000, 350000],
  DO: [240000, 330000],
  LCSW: [55000, 85000],
  LPC: [50000, 80000],
  LMHC: [55000, 85000],
  LMFT: [55000, 85000],
  NP: [100000, 145000],
};

/** The Communication (10%) checklist — 7 fixed items. */
export const COMM_ITEMS: readonly { id: string; label: string }[] = [
  { id: "respond24", label: "Responded within 24 hours of outreach" },
  { id: "profEmail", label: "Professional email communication" },
  { id: "onTime", label: "On time for screening call" },
  { id: "clearEnglish", label: "Clear English communication" },
  { id: "preparedQuestions", label: "Came prepared with questions" },
  { id: "noRedFlags", label: "No red flags (evasive, negative about employers, unprofessional)" },
  { id: "genuineInterest", label: "Genuine interest in the role (not just mass-applying)" },
];

/** Schedule options — the Schedule (15%) section's input. */
export const SCHEDULE_OPTIONS = [
  "Full-time On-site",
  "Full-time Hybrid",
  "Part-time Hybrid",
  "Telehealth Only",
  "Flexible / Open to Anything",
  "3x12hr Shifts",
  "Weekend Availability",
] as const;
export type ScheduleOption = (typeof SCHEDULE_OPTIONS)[number];

/** Pipeline stages the Screening scorecard applies to (legacy: candidates in "1 - Qualified
 *  (Pre-Screen)" / "2 - Initial Screening" / "3 - Desta Review"). */
export const SCREENING_ELIGIBLE_STATUSES = [
  "QUALIFIED_PRESCREEN",
  "INITIAL_SCREENING",
  "DESTA_REVIEW",
] as const;
