/**
 * Client Discovery contract (new domain, core slice) — the isomorphic interface shared by
 * `prospect.service.ts`, the API routes, and the `/client-discovery` client. Pure types + zod (NO
 * server imports), mirroring `validation/lead.ts`'s shape exactly. Wire dates are ISO strings.
 * `city`/`zip` are free text; every `taxonomy` field is the curated specialty dropdown
 * (`CLIENT_DISCOVERY_SPECIALTIES`) — including a manual add, for consistency with search/ICPs and
 * because the list's own "Other Specialty" option already covers anything that doesn't fit.
 */
import { z } from "zod";
import {
  CLIENT_DISCOVERY_SPECIALTIES,
  PROSPECT_STATUSES,
  US_STATES,
  type ProspectStatus,
} from "@/lib/constants";
import type { PageMeta } from "@/lib/pagination";
import { boolFlagSchema } from "./pipeline";

// --- response DTOs (serialized wire shapes) ---------------------------------

export interface ProspectListItemDTO {
  id: string;
  practiceName: string;
  npi: string | null;
  taxonomy: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  website: string | null;
  status: ProspectStatus;
  ownerName: string | null;
  source: string;
  createdAt: string; // ISO
  deletedAt: string | null;
}

export interface ProspectListDTO extends PageMeta {
  prospects: ProspectListItemDTO[];
}

export interface ProspectContactDTO {
  id: string;
  fullName: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  seniority: string | null;
  source: string;
  notes: string | null;
  createdAt: string; // ISO
}

export interface ProspectDetailDTO extends ProspectListItemDTO {
  notes: string | null;
  ownerId: string | null;
  icpId: string | null;
  contacts: ProspectContactDTO[]; // newest-first
}

// --- NPPES search -------------------------------------------------------------

/** Query for the `/client-discovery/search` RSC read — an explicit-submit search, not a live
 *  filter (mirrors `discoverSearchQuerySchema`). NPPES itself rejects a criteria-less query, so
 *  at least one of taxonomy/state/city/zip is required. `taxonomy` is the curated specialty
 *  dropdown (`CLIENT_DISCOVERY_SPECIALTIES`), ported verbatim from the legacy reference build —
 *  see `client-discovery-specialty.ts`'s doc comment. */
export const searchProspectsSchema = z
  .object({
    taxonomy: z.enum(CLIENT_DISCOVERY_SPECIALTIES as [string, ...string[]]).optional(),
    state: z.enum(US_STATES).optional(),
    city: z.string().trim().max(100).optional(),
    zip: z.string().trim().max(20).optional(),
  })
  .refine((v) => Boolean(v.taxonomy || v.state || v.city || v.zip), {
    message: "Add a specialty, state, city, or zip to search.",
  });
export type SearchProspectsQuery = z.infer<typeof searchProspectsSchema>;

export interface ProspectSearchResultItemDTO {
  npi: string;
  practiceName: string;
  taxonomy: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  /** True when this NPI is already tracked as a (possibly soft-deleted) Prospect. */
  alreadyTracked: boolean;
}

export interface ProspectSearchResultDTO {
  results: ProspectSearchResultItemDTO[];
  /** NPPES's true match count — may exceed `results.length` when more than 50 matched. */
  resultCount: number;
}

// --- request schemas (server validates; client reuses) ----------------------

/** One NPPES search result row the client selected — carries everything needed to create the
 *  prospect. Mirrors `discoverAddRowSchema`. */
const addFromSearchRowSchema = z
  .object({
    npi: z.string().regex(/^\d{10}$/),
    practiceName: z.string().trim().min(1).max(200),
    taxonomy: z.string().trim().max(200).nullish(),
    city: z.string().trim().max(100).nullish(),
    state: z.string().trim().max(60).nullish(),
    zip: z.string().trim().max(20).nullish(),
    phone: z.string().trim().max(50).nullish(),
  })
  .strict();

/** Body for `POST /api/prospects/bulk-add` — bulk add selected NPPES rows to the pipeline. */
export const addProspectsFromSearchSchema = z
  .object({
    rows: z.array(addFromSearchRowSchema).min(1).max(50), // NPPES itself caps a search at 50
    icpId: z.string().min(1).nullish(),
  })
  .strict();
export type AddProspectsFromSearchInput = z.infer<typeof addProspectsFromSearchSchema>;

/** Body for `POST /api/prospects` — add a prospect manually. `status`/`source` are NOT accepted —
 *  a manual create always starts at "Fresh Lead" / source "Manual" (the service forces both). */
export const addProspectSchema = z
  .object({
    practiceName: z.string().trim().min(1).max(200),
    taxonomy: z.enum(CLIENT_DISCOVERY_SPECIALTIES as [string, ...string[]]).nullish(),
    city: z.string().trim().max(100).nullish(),
    state: z.string().trim().max(60).nullish(),
    zip: z.string().trim().max(20).nullish(),
    phone: z.string().trim().max(50).nullish(),
    website: z.string().trim().url().max(500).nullish(),
    notes: z.string().trim().max(5000).nullish(),
  })
  .strict();
export type AddProspectInput = z.infer<typeof addProspectSchema>;

/** Body for `PATCH /api/prospects/:id` — partial edit; only supplied fields change. */
export const updateProspectSchema = z
  .object({
    status: z.enum(PROSPECT_STATUSES).optional(),
    ownerId: z.string().min(1).nullable().optional(),
    notes: z.string().trim().max(5000).nullable().optional(),
    website: z.string().trim().url().max(500).nullable().optional(),
  })
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Provide at least one field to update",
  });
export type UpdateProspectInput = z.infer<typeof updateProspectSchema>;

/** Body for `POST /api/prospects/:id/contacts` — add a contact manually. */
export const addProspectContactSchema = z
  .object({
    fullName: z.string().trim().min(1).max(200),
    title: z.string().trim().max(150).nullish(),
    email: z.string().trim().email().max(200).nullish(),
    phone: z.string().trim().max(50).nullish(),
    linkedinUrl: z.string().trim().url().max(500).nullish(),
    seniority: z.string().trim().max(60).nullish(),
    notes: z.string().trim().max(2000).nullish(),
  })
  .strict();
export type AddProspectContactInput = z.infer<typeof addProspectContactSchema>;

const bulkIds = z.array(z.string().min(1)).min(1).max(200);

/** Body for `POST /api/prospects/bulk` — a converted (Client) prospect is SKIPPED server-side by
 *  status/assign actions (terminal). The response reports `{ affected, skipped }`. */
export const bulkProspectActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("delete"), ids: bulkIds }).strict(),
  z.object({ action: z.literal("restore"), ids: bulkIds }).strict(),
  z
    .object({ action: z.literal("status"), ids: bulkIds, value: z.enum(PROSPECT_STATUSES) })
    .strict(),
  z.object({ action: z.literal("assign"), ids: bulkIds, value: z.string().min(1) }).strict(),
]);
export type BulkProspectActionInput = z.infer<typeof bulkProspectActionSchema>;

/** Query for `GET /api/prospects/list` (the `/client-discovery` inventory). */
export const prospectListQuerySchema = z.object({
  status: z.enum(PROSPECT_STATUSES).optional(),
  ownerId: z.string().trim().min(1).optional(),
  source: z.string().trim().min(1).max(120).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  /** "Show deleted" — include soft-deleted prospects (they render flagged, with a Restore action). */
  deleted: boolFlagSchema.optional(),
  /** 1-based OFFSET page (clamped server-side to `[1, totalPages]`). */
  page: z.coerce.number().int().min(1).optional(),
});
