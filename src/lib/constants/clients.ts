/**
 * Base clients — the recruiting accounts DestaHealth places candidates with (from
 * `DATA-MODEL.md`). A minimal `clients` table exists from day one, seeded from this list;
 * scoring rules (`client_rules`) land in a later wave, so only name + optional capacity here.
 *
 * `legacyId` is the free-text client name the legacy Sheet stored on each candidate, kept as
 * the stable upsert key so the seed (and the one-shot ETL) are idempotent.
 */

export interface BaseClient {
  legacyId: string;
  name: string;
  capacity?: number;
}

export const BASE_CLIENTS: readonly BaseClient[] = [
  { legacyId: "Sterling Institute", name: "Sterling Institute" },
  { legacyId: "Contemporary Care", name: "Contemporary Care" },
  { legacyId: "DOCs Medical Group", name: "DOCs Medical Group" },
  { legacyId: "Ritu Suri & Associates", name: "Ritu Suri & Associates" },
  { legacyId: "NJ-Psych Candidates", name: "NJ-Psych Candidates" },
  { legacyId: "Future Potential Clients", name: "Future Potential Clients" },
] as const;

/**
 * Per-client scoring/matching rules seed — DATA, not code (DECISIONS: scoring rules live in a table,
 * consumed by the pure `scoreCandidate`). Seeded into `client_rules` via `db:seed:rules`, keyed to
 * `BASE_CLIENTS` by `clientName` (== the client `name`, which equals `legacyId`). Every `creds` /
 * `pops` / `settings` token below is a member of `CREDENTIALS` / `POPULATIONS` / `SETTINGS`, and every
 * `states` token a member of `US_STATES` (verified — no unknown vocab). An empty array means "no
 * constraint on this dimension" (it contributes nothing to a candidate's `max`); *Future Potential
 * Clients* constrains nothing, so its candidates always score `null` (max 0), not 0%.
 */
export interface BaseClientRules {
  clientName: string; // matches BASE_CLIENTS[].name (== legacyId)
  states: readonly string[];
  creds: readonly string[];
  pops: readonly string[];
  settings: readonly string[];
  priority: "HIGH" | "MED" | "STANDARD";
  autoDisqualify: readonly string[];
}

export const BASE_CLIENT_RULES: readonly BaseClientRules[] = [
  {
    clientName: "Sterling Institute",
    states: ["CT"],
    creds: ["PMHNP", "PMHNP-BC", "MD", "DO", "PsyD", "PhD"],
    pops: ["Child/Adolescent"],
    settings: ["Hybrid", "Outpatient"],
    priority: "HIGH",
    autoDisqualify: ["No CT license", "No child/adolescent experience"],
  },
  {
    clientName: "Contemporary Care",
    states: ["CT", "NJ", "FL"],
    creds: ["PMHNP", "PMHNP-BC", "MD", "DO", "LCSW", "LPC", "LMHC", "LMFT"],
    pops: [],
    settings: ["Hybrid", "Outpatient", "Telehealth"],
    priority: "MED",
    autoDisqualify: ["License must match position state"],
  },
  {
    clientName: "DOCs Medical Group",
    states: ["CT"],
    creds: ["PMHNP", "PMHNP-BC", "MD", "DO"],
    pops: [],
    settings: ["Outpatient"],
    priority: "STANDARD",
    autoDisqualify: ["No CT license", "On-site only — no telehealth"],
  },
  {
    clientName: "Ritu Suri & Associates",
    states: ["CT", "NY"],
    creds: ["PMHNP", "PMHNP-BC", "MD", "DO", "PsyD"],
    pops: [],
    settings: ["Outpatient", "Hybrid", "Telehealth"],
    priority: "MED",
    autoDisqualify: [],
  },
  {
    clientName: "NJ-Psych Candidates",
    states: ["NJ"],
    creds: ["PMHNP", "PMHNP-BC", "MD", "DO", "PsyD", "PhD", "LCSW", "LPC"],
    pops: [],
    settings: [],
    priority: "MED",
    autoDisqualify: ["NJ license required"],
  },
  {
    clientName: "Future Potential Clients",
    states: [],
    creds: [],
    pops: [],
    settings: [],
    priority: "STANDARD",
    autoDisqualify: [],
  },
] as const;

/**
 * Hot-candidate threshold — a candidate whose fit `pct` is at or above this is surfaced as "Hot"
 * (green badge + chip) across card / list / detail. Single source of truth so the cutoff is not
 * duplicated in the UI (resolved OQ-1: HOT_SCORE = 80).
 */
export const HOT_SCORE = 80;
