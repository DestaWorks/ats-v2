/**
 * Platform metrics contract (SAAS-RESTRUCTURE-PLAN 6.8 / Phase 8).
 *
 * ── Why this is a separate file from `reports.ts`, and must stay one ───────────────────────────
 *
 * Phase 8's bullet is "platform metrics SEPARATE from any tenant's reports", and the word doing
 * the work is *separate*. The two answer different questions on different authority axes:
 *
 *   `reports.ts`  — "how is MY recruiting pipeline doing", read by a member of one tenant, gated
 *                   by a tenant `Capability`, and scoped to that tenant by the seam.
 *   this file     — "how is the INSTALLATION doing", read on the platform axis, gated by a
 *                   `PlatformCapability`, and scoped to nothing because it is about all of it.
 *
 * Sharing a schema would be the first step to sharing a handler, and a handler that can serve both
 * is one bug away from serving a tenant's operator an installation-wide total, or a platform admin
 * one tenant's pipeline. So there is no import between them in either direction, no shared filter
 * type, and no shared envelope.
 *
 * ── Why no tenant is named anywhere below ─────────────────────────────────────────────────────
 *
 * Every field here is an installation-wide total. That is a product decision and a privacy one:
 * an aggregate over a small tenant re-identifies it, and a per-tenant breakdown of AI usage or
 * document storage would be exactly that. Per-tenant health is `platform-admin.service.ts`, where
 * naming one tenant is the point and the read is audited into that tenant. Here nothing is named,
 * so nothing can be attributed.
 */
import { z } from "zod";

/** The longest window the installation view will aggregate over, in days. */
export const PLATFORM_METRICS_MAX_DAYS = 180;
export const PLATFORM_METRICS_DEFAULT_DAYS = 30;

/**
 * `GET /platform/metrics` — the only input is how far back to look.
 *
 * `.strict()` so an unknown key is refused rather than ignored, and bounded at both ends: the
 * window is what stops every aggregate below from being an unbounded scan, so it cannot be a
 * number the caller chooses freely.
 */
export const platformMetricsQuerySchema = z
  .object({
    days: z.coerce
      .number()
      .int()
      .min(1)
      .max(PLATFORM_METRICS_MAX_DAYS)
      .default(PLATFORM_METRICS_DEFAULT_DAYS),
  })
  .strict();
export type PlatformMetricsQuery = z.infer<typeof platformMetricsQuerySchema>;

/** The half-open window `[since, until)` the totals were computed over. */
export interface PlatformWindowDTO {
  since: string; // ISO
  until: string; // ISO
  days: number;
}

/** One bucket of a categorical count — a tenant status, a plan name, a job schedule. */
export interface PlatformBucketDTO {
  key: string;
  count: number;
}

/** How many workspaces exist, and in what shape. Read entirely from the global `Tenant` table. */
export interface PlatformTenantCountsDTO {
  total: number;
  byStatus: PlatformBucketDTO[];
  byPlan: PlatformBucketDTO[];
}

/**
 * Seat licensing across the installation.
 *
 * Totals only. Whether one tenant is over ITS limit is per-tenant health and belongs to
 * `platform-admin.service.ts`; duplicating that comparison here would give the installation two
 * definitions of "over seat limit" that drift.
 */
export interface PlatformSeatsDTO {
  seatsLicensed: number;
  seatsUsed: number;
  tenantsWithoutSeatLimit: number;
}

/** New workspaces per UTC day, oldest first. Every day in the window appears, zeroes included. */
export interface PlatformSignupPointDTO {
  day: string; // YYYY-MM-DD
  tenants: number;
}

/** How many workspaces are actually being used, as opposed to merely existing. */
export interface PlatformActivityDTO {
  /** Live tenants with at least one active member holding an unexpired session. */
  activeTenants: number;
  liveTenants: number;
}

/** One background schedule's claim history inside the window. */
export interface PlatformScheduleDTO {
  schedule: string;
  runs: number;
  lastOccurrenceAt: string | null; // ISO
}

export interface PlatformJobHealthDTO {
  runsInWindow: number;
  schedules: PlatformScheduleDTO[];
}

/**
 * AI consumption across every tenant, in the window.
 *
 * Deliberately NOT money. `AiUsageEvent` records provider, model, token counts and latency; it has
 * no cost column and there is no price table in the schema, so a currency figure here would be a
 * hardcoded rate card silently going stale. Tokens are what the installation actually recorded.
 */
export interface PlatformAiUsageDTO {
  calls: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
}

/** Document storage across every tenant, as of the end of the window. */
export interface PlatformStorageDTO {
  documents: number;
  knownBytes: number;
  /** `Document.sizeBytes` is nullable, so `knownBytes` is a floor. This says by how much. */
  documentsOfUnknownSize: number;
}

/**
 * How much of the installation the cross-tenant sections actually cover.
 *
 * The tenant-scoped totals are computed by walking tenants one at a time (see the repository for
 * why that is the only correct shape under FORCE row-level security), so they are bounded by a
 * scan limit. A truncated aggregate that did not say so would be a wrong number wearing the
 * clothes of a right one.
 */
export interface PlatformCoverageDTO {
  tenantsScanned: number;
  tenantsTotal: number;
  truncated: boolean;
}

export interface PlatformMetricsDTO {
  window: PlatformWindowDTO;
  tenants: PlatformTenantCountsDTO;
  seats: PlatformSeatsDTO;
  signups: PlatformSignupPointDTO[];
  activity: PlatformActivityDTO;
  jobs: PlatformJobHealthDTO;
  /**
   * `null` when the caller holds `viewTenants` but not `readTenantData`. These two sections are
   * the only ones read from inside tenants, so they are the only ones that need the capability
   * that crosses the isolation boundary — and omitting them is the honest failure, not zeroes.
   */
  aiUsage: PlatformAiUsageDTO | null;
  storage: PlatformStorageDTO | null;
  coverage: PlatformCoverageDTO;
}

export interface GetPlatformMetricsResponse {
  metrics: PlatformMetricsDTO;
}
