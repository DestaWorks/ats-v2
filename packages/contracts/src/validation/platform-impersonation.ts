/**
 * Support impersonation (SAAS-RESTRUCTURE-PLAN Phase 8) — the wire shapes of the one feature that
 * deliberately crosses the tenant isolation boundary Phase 6 exists to enforce.
 *
 * Two axes meet here and the contract keeps them apart. The `SupportWindow*` shapes belong to the
 * TENANT: a workspace granting, inspecting or withdrawing its own consent. The `Impersonated*`
 * shapes belong to the PLATFORM: what an admin gets back after that consent is verified. Nothing
 * on the tenant side names a platform capability, and nothing on the platform side accepts a
 * duration — so no request body exists through which a tenant could widen its own grant into
 * platform authority, or an admin could extend the window they are acting inside.
 */
import { z } from "zod";

/**
 * Why a support request was raised, as a fixed vocabulary rather than free text.
 *
 * The reason is written into the tenant's permanent, append-only audit trail, which is read by a
 * wider audience than the people who can see the records it might describe. A text box there is a
 * PII vector with no owner — an admin typing "checking A. Bekele's license" puts a candidate's name
 * in a log that outlives the ticket. An enum cannot, and it filters and aggregates besides.
 */
export const SUPPORT_REASONS = [
  "billing",
  "access-issue",
  "data-issue",
  "bug-report",
  "other",
] as const;
export type SupportReason = (typeof SUPPORT_REASONS)[number];

/**
 * The bounds of a support window, in minutes.
 *
 * Stated here, once, because both ends of the wire need them: the schema rejects an out-of-range
 * request at the boundary, and the service clamps to `MAX` when it computes the expiry, so the
 * ceiling holds even for a caller that never passed through the schema.
 */
export const MIN_SUPPORT_WINDOW_MINUTES = 5;
export const MAX_SUPPORT_WINDOW_MINUTES = 60;

/** `POST /platform/impersonation/consent` — the tenant opens a bounded support window. */
export const grantSupportWindowSchema = z
  .object({
    minutes: z.number().int().min(MIN_SUPPORT_WINDOW_MINUTES).max(MAX_SUPPORT_WINDOW_MINUTES),
    reason: z.enum(SUPPORT_REASONS),
  })
  .strict();
export type GrantSupportWindowInput = z.infer<typeof grantSupportWindowSchema>;

/**
 * A tenant's current consent state, as the tenant sees it.
 *
 * `open` is derived from the clock server-side on every read, never stored — a window that has run
 * out reports `open: false` while still reporting when it was granted, so the workspace can see
 * that support was here and that it no longer is.
 */
export interface SupportWindowDTO {
  tenantId: string;
  open: boolean;
  reason: SupportReason | null;
  grantedAt: string | null;
  expiresAt: string | null;
}

/**
 * The marker every impersonated response carries.
 *
 * An impersonated read must never be indistinguishable from the real user acting, and the wire is
 * one of the three places that has to be true (the others being the tenant's audit trail and the
 * server logs). It is a required field of a required object, so a response cannot omit it, and
 * `impersonated` is the literal `true` rather than a boolean — there is no such thing as a
 * non-impersonated response of this type.
 */
export interface ImpersonationMarkerDTO {
  impersonated: true;
  tenantId: string;
  platformUserId: string;
  /** When the consent this read rode on runs out. */
  expiresAt: string;
}

/**
 * One activity-trail row as support sees it.
 *
 * Ids, an action and a timestamp — never the `before`/`after` snapshots, which are where the
 * candidate and client PII lives. A support engineer needs to know what happened and in what order;
 * they do not need to know whose license number changed.
 */
export interface ImpersonatedActivityEntryDTO {
  id: string;
  at: string;
  actor: string;
  action: string;
  entity: string;
  entityId: string;
}

export interface GetSupportWindowResponse {
  window: SupportWindowDTO;
}

export interface PostSupportWindowResponse {
  window: SupportWindowDTO;
}

export interface DeleteSupportWindowResponse {
  window: SupportWindowDTO;
}

export interface GetImpersonatedActivityResponse {
  impersonation: ImpersonationMarkerDTO;
  items: ImpersonatedActivityEntryDTO[];
  nextCursor: string | null;
  hasMore: boolean;
}
