/**
 * Source-lead contract (Wave 2.6, Sourcing) — the isomorphic interface shared by the lead service,
 * the API routes, and the `/sourcing` client. Pure types + zod (NO server imports), so the frontend
 * validates against exactly the shapes the server does.
 *
 * Wire dates are ISO strings (both `Response.json` and the RSC serializer produce strings), so every
 * DTO date here is `string`. Leads carry NO `licenseNumber`-class PII (contact fields only), so
 * there is no `viewCredentials` gate on the projection — the surface is auth-gated as a whole (L-7).
 * Sourcing vocab (`credential`/`state`/`source`/`tags`) is stored as FREE TEXT (not the candidate
 * strict-vocab enums) — the promote mapper coerces it; here it is only length-bounded.
 */
import { z } from "zod";
import {
  LEAD_STATUSES,
  OUTREACH_CHANNELS,
  type LeadStatus,
  type OutreachChannel,
} from "@/lib/constants";

// --- response DTOs (serialized wire shapes) ---------------------------------

/** One row in the `/sourcing` inventory — the lead + its denormalized outreach summary. */
export interface LeadListItemDTO {
  id: string;
  name: string; // PII — /sourcing is auth-gated (OK)
  email: string | null;
  phone: string | null;
  credential: string | null; // raw title (free text)
  state: string | null;
  source: string | null;
  status: LeadStatus;
  outreachCount: number;
  lastOutreachAt: string | null; // ISO
  targetClientName: string | null;
  promotedCandidateId: string | null; // present once promoted → the row links to the candidate
  createdAt: string; // ISO
  /** Soft-delete marker (ISO) — non-null only in the "Show deleted" view; drives row styling + Restore. */
  deletedAt: string | null;
}

/** The `/sourcing` list payload — one keyset page + the honest filtered total. */
export interface LeadListDTO {
  leads: LeadListItemDTO[];
  count: number; // rows in this page
  hasMore: boolean;
  nextCursor: string | null;
  total: number; // true filtered count ("Showing N of M")
}

/** One logged outreach attempt (newest-first on the detail view). */
export interface OutreachAttemptDTO {
  id: string;
  channel: OutreachChannel;
  at: string; // ISO
  note: string | null;
  actorId: string;
  actorName: string | null;
}

/** The full lead detail — the list item plus the sourcing context + the attempt log. */
export interface LeadDetailDTO extends LeadListItemDTO {
  linkedinUrl: string | null;
  tags: string[];
  notes: string | null;
  respondedAt: string | null; // ISO
  targetClientId: string | null;
  attempts: OutreachAttemptDTO[]; // newest-first; actorName via userRepository.namesByIds
}

// --- request schemas (server validates; client reuses) ----------------------

/**
 * Body for `POST /api/leads` — add a lead. `name` is REQUIRED; everything else is optional. The
 * sourcing vocab fields (`credential`/`state`/`source`/`tags`) are FREE TEXT (length-bounded only) —
 * NOT validated against the candidate enums, which is exactly why promote runs the coercing mapper.
 * `status` is NOT accepted — a create always starts at "Sourced" (the service forces it). `.strict()`
 * rejects any unknown key.
 */
export const addLeadSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(200).nullish(),
    phone: z.string().trim().max(50).nullish(),
    linkedinUrl: z.string().trim().url().max(500).nullish(),
    credential: z.string().trim().max(120).nullish(),
    state: z.string().trim().max(60).nullish(),
    source: z.string().trim().max(120).nullish(),
    tags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
    notes: z.string().trim().max(5000).nullish(),
    clientId: z.string().min(1).nullish(),
  })
  .strict();
export type CreateLeadInput = z.infer<typeof addLeadSchema>;

/**
 * Body for `POST /api/leads/:id/outreach`. `channel` is validated against `OUTREACH_CHANNELS`; `at`
 * defaults to "now" server-side when absent. Logging advances the lead through the outreach stages
 * (server-authoritative, via `advanceOnOutreach`).
 */
export const logOutreachSchema = z
  .object({
    channel: z.enum(OUTREACH_CHANNELS),
    note: z.string().trim().max(2000).nullish(),
    at: z.coerce.date().optional(),
  })
  .strict();
export type LogOutreachInput = z.infer<typeof logOutreachSchema>;

/** Body for `POST /api/leads/:id/respond`. `kind` is the response temperature (Hot/Cold). */
export const respondSchema = z
  .object({
    kind: z.enum(["hot", "cold"]),
  })
  .strict();
export type RespondInput = z.infer<typeof respondSchema>;

/**
 * Query for `GET /api/leads/list` (the `/sourcing` inventory load-more). All filters optional;
 * `status` is a `LeadStatus`, `source` is free text, `search` matches name/email, and `cursor` is the
 * opaque keyset cursor (decoded at the route → 400 if malformed).
 */
export const leadListQuerySchema = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  source: z.string().trim().min(1).max(120).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  /** "Show deleted" — include soft-deleted leads (they render flagged, with a Restore action). */
  deleted: z.preprocess((v) => v === "1" || v === "true", z.boolean()).optional(),
  cursor: z.string().min(1).optional(),
});
export type LeadListQuery = z.infer<typeof leadListQuerySchema>;
