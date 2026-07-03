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
