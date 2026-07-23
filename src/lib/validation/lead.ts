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
import type { PageMeta } from "@/lib/pagination";
import { boolFlagSchema } from "./pipeline";

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
  /** Channel of the newest attempt (denorm) — the legacy "Last touch" cell ("linkedin · 20d"). */
  lastOutreachChannel: string | null;
  targetClientName: string | null;
  /** Who sourced the lead (`createdById` resolved to a display name; legacy Owner column). */
  ownerName: string | null;
  promotedCandidateId: string | null; // present once promoted → the row links to the candidate
  createdAt: string; // ISO
  /** Soft-delete marker (ISO) — non-null only in the "Show deleted" view; drives row styling + Restore. */
  deletedAt: string | null;
  /**
   * Snoozed-until date (ISO) or null. A snooze in the FUTURE excludes the lead from stuck-lead
   * alerts and shows the 💤 badge; a past date counts as awake everywhere (the legacy brief
   * treated any non-empty value as snoozed forever — fixed here).
   */
  snoozedUntil: string | null;
}

/**
 * The `/sourcing` list payload — a server OFFSET page (mirrors `CandidateListDTO`): filters in
 * SQL `WHERE`, newest-first `ORDER BY`, `skip`/`take` pagination; `page` clamped to
 * `[1, totalPages]`; `hasPrev`/`hasNext` drive the numbered pager.
 */
export interface LeadListDTO extends PageMeta {
  leads: LeadListItemDTO[];
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
    /** National Provider Identifier — set when a lead originates from Discover (NPPES); the
     *  manual "Add lead" form never populates it. */
    npi: z
      .string()
      .regex(/^\d{10}$/)
      .nullish(),
  })
  .strict();
export type CreateLeadInput = z.infer<typeof addLeadSchema>;

/**
 * Body for `POST /api/leads/:id/outreach`. `channel` is validated against `OUTREACH_CHANNELS`; `at`
 * defaults to "now" server-side when absent. Logging advances the lead through the outreach stages
 * (server-authoritative, via `advanceOnOutreach`). Shared verbatim by `POST /api/candidates/:id/
 * outreach` (`candidateService.logOutreach` imports this same schema — one `outreach_attempts`
 * table serves both recipient types, L-3).
 *
 * `templateId` (Wave 4.1, Templates) is an OPTIONAL key into the `TEMPLATES` constant
 * (`lib/constants/templates.ts`) — set when this attempt was logged via the Templates page's
 * Copy All / Open in Gmail actions, `null`/absent for a manually-logged attempt. Not a DB foreign
 * key (templates aren't a DB table); Template Performance groups by this string.
 */
export const logOutreachSchema = z
  .object({
    channel: z.enum(OUTREACH_CHANNELS),
    note: z.string().trim().max(2000).nullish(),
    at: z.coerce.date().optional(),
    templateId: z.string().trim().min(1).max(64).nullish(),
  })
  .strict();
export type LogOutreachInput = z.infer<typeof logOutreachSchema>;

/** Body for `POST /api/leads/:id/respond`. `kind` is the response temperature (Hot/Cold). */
export const respondSchema = z
  .object({
    kind: z.enum(["hot", "cold"]),
  })
  .strict();

/**
 * Body for `POST /api/leads/:id/snooze` (`source_lead_snooze` parity). A date sets the snooze
 * (excluded from stuck alerts until then); `null` wakes the lead (legacy sent `until: ""`).
 */
export const snoozeLeadSchema = z
  .object({
    until: z.coerce.date().nullable(),
  })
  .strict();

/**
 * Body for `PATCH /api/leads/:id/outreach/:attemptId` (`source_lead_edit_outreach` parity).
 * Partial — only supplied fields change. Editing NEVER touches the lead's status (legacy hid the
 * status selector on edit).
 *
 * `response`/`respondedAt` (Wave 4.1, Templates) manually mark/correct whether this specific
 * attempt got a reply — the same fields `leadService.respond()` auto-sets on the most recent
 * unresponded attempt when a lead is marked Hot/Cold. Manual edit exists for correction (e.g. the
 * auto-backfill picked the wrong attempt, or a response came in for an OLDER attempt).
 */
export const updateOutreachSchema = z
  .object({
    channel: z.enum(OUTREACH_CHANNELS).optional(),
    note: z.string().trim().max(2000).nullish(),
    at: z.coerce.date().optional(),
    response: z.string().trim().max(500).nullish(),
    respondedAt: z.coerce.date().nullish(),
  })
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Provide at least one field to update",
  });
export type UpdateOutreachInput = z.infer<typeof updateOutreachSchema>;

const bulkIds = z.array(z.string().min(1)).min(1).max(200);

/**
 * Body for `POST /api/leads/bulk` (`source_lead_bulk_action` + `source_lead_undelete` +
 * `source_lead_bulk_log_outreach` parity, one discriminated endpoint). Promoted leads are
 * SKIPPED server-side by status/outreach actions (their lifecycle is closed); delete/restore
 * skip rows already in the target state. The response reports `{ affected, skipped }`.
 */
export const bulkLeadActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("delete"), ids: bulkIds }).strict(),
  z.object({ action: z.literal("restore"), ids: bulkIds }).strict(),
  z.object({ action: z.literal("status"), ids: bulkIds, value: z.enum(LEAD_STATUSES) }).strict(),
  z.object({ action: z.literal("assign"), ids: bulkIds, value: z.string().min(1) }).strict(),
  z
    .object({ action: z.literal("client"), ids: bulkIds, value: z.string().min(1).nullable() })
    .strict(),
  z
    .object({
      action: z.literal("outreach"),
      ids: bulkIds,
      channel: z.enum(OUTREACH_CHANNELS),
      note: z.string().trim().max(2000).nullish(),
    })
    .strict(),
]);
export type BulkLeadActionInput = z.infer<typeof bulkLeadActionSchema>;

/** One CSV/paste import row. The CLIENT sanitizes free-form cells (bad emails/URLs → null) before
 * posting; `clientName` is resolved to a client id server-side (case-insensitive, unknown → null). */
export const importLeadRowSchema = z
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
    clientName: z.string().trim().max(200).nullish(),
    status: z.enum(LEAD_STATUSES).optional(),
  })
  .strict();
export type ImportLeadRow = z.infer<typeof importLeadRowSchema>;

/** Body for `POST /api/leads/import` — ONE chunk (the client sends ≤200-row chunks sequentially,
 * `source_lead_bulk_import` parity). Dedup is SERVER-side: lowercased email, else name+phone. */
export const importLeadsSchema = z
  .object({
    rows: z.array(importLeadRowSchema).min(1).max(200),
  })
  .strict();
export type ImportLeadsInput = z.infer<typeof importLeadsSchema>;

/**
 * Query for `GET /api/leads/list` (the `/sourcing` inventory load-more). All filters optional;
 * `status` is a `LeadStatus`, `source` is free text, `search` matches name/email, and `cursor` is the
 * opaque keyset cursor (decoded at the route → 400 if malformed).
 */
export const leadListQuerySchema = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  source: z.string().trim().min(1).max(120).optional(),
  clientId: z.string().trim().min(1).optional(),
  ownerId: z.string().trim().min(1).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  /** "Show deleted" — include soft-deleted leads (they render flagged, with a Restore action). */
  deleted: boolFlagSchema.optional(),
  /** 1-based OFFSET page (clamped server-side to `[1, totalPages]`). */
  page: z.coerce.number().int().min(1).optional(),
});
