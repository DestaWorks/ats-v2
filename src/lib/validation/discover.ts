/**
 * Discover (NPPES) contract (Wave 2.7) — isomorphic types + zod shared by the discover routes and
 * the `/discover` client. Pure (NO server imports). A search result row carries everything needed
 * to create a lead directly (no separate "fetch details" round-trip); `source` is never a client
 * field on the add-to-sourcing body — the service forces it to `"NPPES"` server-side.
 */
import { z } from "zod";
import { TAXONOMY_OPTIONS, US_STATES } from "@/lib/constants";

const taxonomyValues = TAXONOMY_OPTIONS.map((t) => t.value) as [string, ...string[]];

/** Query for the `/discover` RSC read — an explicit-submit search, not a live filter. NPPES itself
 *  rejects a `state`-only query ("requires additional search criteria"), so at least one of
 *  taxonomy/city/firstName/lastName must also be present. */
export const discoverSearchQuerySchema = z
  .object({
    taxonomy: z.enum(taxonomyValues).optional(),
    state: z.enum(US_STATES).optional(),
    city: z.string().trim().max(100).optional(),
    firstName: z.string().trim().max(100).optional(),
    lastName: z.string().trim().max(100).optional(),
  })
  .refine((v) => Boolean(v.taxonomy || v.city || v.firstName || v.lastName), {
    message: "Add a provider type, city, or name to search.",
  });
export type DiscoverSearchQuery = z.infer<typeof discoverSearchQuerySchema>;

/** One NPPES result row the client selected — carries everything needed to create the lead. */
export const discoverAddRowSchema = z
  .object({
    npi: z.string().regex(/^\d{10}$/),
    name: z.string().trim().min(1).max(200),
    credential: z.string().trim().max(120).nullish(),
    state: z.string().trim().max(60).nullish(),
    city: z.string().trim().max(100).nullish(),
    phone: z.string().trim().max(50).nullish(),
    taxonomyDesc: z.string().trim().max(200).nullish(),
    licenseNumber: z.string().trim().max(60).nullish(),
  })
  .strict();
export type DiscoverAddRow = z.infer<typeof discoverAddRowSchema>;

/** Body for `POST /api/discover/add` — bulk add selected NPPES rows to Sourcing. */
export const discoverAddToSourcingSchema = z
  .object({
    rows: z.array(discoverAddRowSchema).min(1).max(50), // NPPES itself caps a search at 50
    clientId: z.string().min(1).nullish(),
  })
  .strict();
export type DiscoverAddToSourcingInput = z.infer<typeof discoverAddToSourcingSchema>;

// --- response DTOs -----------------------------------------------------------

export interface DiscoverResultItemDTO {
  npi: string;
  firstName: string;
  lastName: string;
  credential: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  taxonomyDesc: string | null;
  licenseNumber: string | null;
  licenseState: string | null;
  dupStatus: "new" | "in_sourcing" | "in_pipeline";
  dupMatchId: string | null;
  dupMatchLabel: string | null;
}

export interface DiscoverSearchResultDTO {
  results: DiscoverResultItemDTO[];
  /** NPPES's true match count — may exceed `results.length` when more than 50 matched. */
  resultCount: number;
}
