/**
 * Candidate enumerations — ported verbatim from the legacy constants
 * (`CREDS`, `POPS`, `SETS`, `SOURCES`, `TAGS`) plus track and license-status values.
 */

/** Clinical credentials (legacy `CREDS`). */
export const CREDENTIALS = [
  "MD",
  "DO",
  "PMHNP",
  "PMHNP-BC",
  "NP",
  "APRN",
  "PA",
  "PA-C",
  "LCSW",
  "LPC",
  "LMHC",
  "LMFT",
  "LMFT-A",
  "LMSW",
  "LAC",
  "PsyD",
  "PhD",
  "MHT",
  "BHT",
  "Other",
] as const;
export type Credential = (typeof CREDENTIALS)[number];

/** Patient populations (legacy `POPS`). */
export const POPULATIONS = [
  "Child/Adolescent",
  "Adult",
  "Geriatric",
  "Across the Lifespan",
] as const;
export type Population = (typeof POPULATIONS)[number];

/** Practice settings (legacy `SETS`). */
export const SETTINGS = [
  "Outpatient",
  "Telehealth",
  "Hybrid",
  "IOP",
  "PHP",
  "Residential",
  "Inpatient",
] as const;
export type Setting = (typeof SETTINGS)[number];

/** Telehealth work-mode PREFERENCE (legacy `TELE_OPT`) — what they want, vs `setting` = where they are. */
export const TELEHEALTH_PREFS = ["Telehealth", "On-site", "Hybrid"] as const;
export type TelehealthPref = (typeof TELEHEALTH_PREFS)[number];

/** Candidate sources (legacy `SOURCES`). */
export const SOURCES = [
  "Indeed",
  "LinkedIn",
  "Rocket Reach",
  "Physician Job Board",
  "Therapist Job Board",
  "Locumtenens",
  "Referral",
  "Cold Outreach",
  "Scraped",
  "Direct Application",
  "NPPES",
] as const;
export type Source = (typeof SOURCES)[number];

/** Candidate tags (legacy `TAGS`). */
export const TAGS = [
  "Priority",
  "Silver Medalist",
  "Telehealth Only",
  "Bilingual",
  "Spanish-Speaking",
  "Referral",
  "Weekend Available",
  "Compact License",
  "Relocation Open",
] as const;
export type Tag = (typeof TAGS)[number];

/**
 * Track — drives stage gates. Legacy uses `c.Track` with "Clinical" (default),
 * "Prescriber", and "Operations"; the gates treat everything non-Operations the same.
 */
export const TRACKS = ["Clinical", "Prescriber", "Operations"] as const;
export type Track = (typeof TRACKS)[number];
export const DEFAULT_TRACK: Track = "Clinical";

/** License verification status (legacy `LicenseStatus`). */
export const LICENSE_STATUSES = [
  "Not Verified",
  "Active",
  "Expired",
  "Under Investigation",
  "Not Found",
] as const;
export type LicenseStatus = (typeof LICENSE_STATUSES)[number];

/**
 * Statuses meaning "we have NOT confirmed a live license". `Not Found` is strictly weaker
 * evidence than `Not Verified` (a board was checked and returned nothing), so every gate,
 * queue and report treats the two identically — audit 2026-08-21 found `Not Found` was in the
 * vocab but handled nowhere, letting those candidates slip past the screening gate AND out of
 * the verification queue that would have caught them.
 */
export const UNVERIFIED_LICENSE_STATUSES: readonly LicenseStatus[] = ["Not Verified", "Not Found"];

/** Statuses that need a recruiter's attention on their own (legacy `index.html:8656-8683`). */
export const ACTION_LICENSE_STATUSES: readonly LicenseStatus[] = [
  ...UNVERIFIED_LICENSE_STATUSES,
  "Expired",
];
