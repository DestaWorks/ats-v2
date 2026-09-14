import type { TenantContext } from "@destaworks/domain/tenant";
import {
  reportFiltersSchema,
  type ReportExportDTO,
  type ReportExportStatusValue,
  type ReportFilters,
} from "@destaworks/contracts/validation/reports";
import { logger } from "@destaworks/config/logger";
import type { Prisma } from "@destaworks/db/generated/prisma/client";
import type { ScopedTx } from "@destaworks/db/tenant-scope";
import {
  reportExportRepository,
  type ReportExportRow,
} from "@destaworks/db/repositories/report-export.repository";
import { AppError } from "@destaworks/integrations/http/app-error";
import {
  EXPORT_BUCKET,
  getSignedDownloadUrl,
  persistedStorageKey,
  type ScopedStorageKey,
  storageEnabled,
  tenantStorageKey,
  uploadPrivate,
} from "@destaworks/integrations/storage";
import { exportService } from "./export.service";
import { systemContextFor } from "@destaworks/domain/system-context";

/**
 * Asynchronous CSV export (Phase 5) — the half of the flow that does NOT belong to the queue.
 *
 * Building the CSV is unbounded work: the cohort is whatever the filter bar selects, so a wide
 * filter is a full table scan rendered to a string inside a request that must answer in seconds.
 * Phase 5 moves the building to a job, which forces the delivery question: a job cannot stream
 * into a response that has already been sent. The answer here is store-then-fetch — the job
 * writes the finished file to a PRIVATE object-storage bucket, and the requester exchanges the
 * export's id for a short-lived signed URL when it is ready.
 *
 * The trade-off, stated plainly: one download becomes three round trips (request, poll, fetch)
 * and the file exists at rest for as long as the bucket's retention keeps it, where before it
 * existed only in flight. That is the price of bounded work, and it is paid deliberately —
 * everything that follows is about making the file at rest as hard to reach as the in-flight one:
 * a private bucket, a URL minted per request and never persisted, and an owner-only read.
 *
 * `application` deliberately does not enqueue — it may not import `@destaworks/jobs` (the
 * dependency law is one-way), so requesting an export returns the row and the composition root
 * that owns both halves does the enqueue.
 */

/** How long a minted download URL stays valid. Long enough to click, short enough to be useless
 *  if it leaks into a proxy log or a shared screenshot. */
const DOWNLOAD_URL_TTL_SECONDS = 300;

/** Widened to the DTO union at the boundary — the column is a free string in Postgres. */
function toStatus(raw: string): ReportExportStatusValue {
  return raw === "ready" || raw === "failed" ? raw : "pending";
}

/**
 * The object key: `t/<tenantId>/candidates/<exportId>.csv` (6.6). The export's cuid carries all the
 * entropy, so the key is unguessable even if the bucket were ever misconfigured — defence in depth
 * behind the private bucket, not instead of it. No candidate name, client or filter value appears
 * in it: a key is metadata that leaks into storage logs and provider dashboards.
 *
 * The tenant comes from the job payload, which is the only place a resumed job can learn it — and
 * the payload's `tenantId` is written by the enqueuing endpoint from the session-resolved context,
 * never from a request body, so it is not a claim the caller can forge.
 *
 * Minting only, never reading: `get` resolves the key persisted on the row, so exports written
 * before this prefix existed keep downloading from the key they were actually stored at.
 */
function storageKeyFor(tenantId: string, exportId: string): ScopedStorageKey {
  return tenantStorageKey(tenantId, "candidates", `${exportId}.csv`);
}

function toDto(row: ReportExportRow, downloadUrl?: string): ReportExportDTO {
  return {
    id: row.id,
    status: toStatus(row.status),
    requestedAt: row.createdAt.toISOString(),
    readyAt: row.readyAt?.toISOString() ?? null,
    byteSize: row.byteSize,
    errorCode: row.errorCode,
    ...(downloadUrl !== undefined
      ? { downloadUrl, expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS }
      : {}),
  };
}

export const reportExportService = {
  /**
   * Record an export request and hand back the row. Storage is checked here rather than in the
   * job, so a misconfigured environment fails at the click with the usual 503 instead of
   * enqueuing work that can only ever dead-letter.
   */
  async request(
    ctx: TenantContext,
    requestedById: string,
    filters: ReportFilters,
    tx?: ScopedTx,
  ): Promise<ReportExportRow> {
    if (!storageEnabled) {
      throw new AppError("FEATURE_DISABLED", "Object storage is not configured");
    }
    // Dates are not JSON, and the payload has to survive a round trip through the queue and the
    // `filters` column identically. ISO strings re-parse through `reportFiltersSchema`'s coercion.
    const serialized: Prisma.InputJsonValue = JSON.parse(JSON.stringify(filters));
    return reportExportRepository.create(ctx, requestedById, serialized, tx);
  },

  /**
   * The export as its requester sees it, with a fresh download URL once it is ready.
   *
   * Ownership is the authorization: `viewReports` says you may export, it does not say you may
   * read someone else's export. A mismatch answers NOT_FOUND rather than FORBIDDEN so the
   * endpoint cannot be used to probe which export ids exist.
   */
  async get(ctx: TenantContext, id: string, viewerId: string): Promise<ReportExportDTO> {
    const row = await reportExportRepository.findById(ctx, id);
    if (!row || row.requestedById !== viewerId) {
      throw new AppError("NOT_FOUND", "Export not found");
    }
    if (row.status !== "ready" || !row.storageKey) return toDto(row);
    const url = await getSignedDownloadUrl(
      EXPORT_BUCKET,
      persistedStorageKey(row.storageKey),
      DOWNLOAD_URL_TTL_SECONDS,
    );
    return toDto(row, url);
  },

  /**
   * Build the CSV and store it. The whole of the job's work, kept here so the storage key
   * convention and the export's own state machine live in one file; the handler in
   * `@destaworks/jobs` stays about job semantics (attempts, deadlines, dead-lettering).
   *
   * Reuses `exportService.candidatesCsv` verbatim — the synchronous route and the job must
   * produce the same bytes from the same filters, or the migration off the route is a rewrite.
   */
  /**
   * `tenantId` rather than a `TenantContext`: a job resumes with no session, and this reads only
   * published columns — the CSV carries no capability-gated field — so a scoping context is all it
   * needs, and `systemContextFor` says so explicitly.
   */
  async fulfil(exportId: string, tenantId: string, rawFilters: unknown, now: Date): Promise<void> {
    const ctx = systemContextFor(tenantId);
    const filters = reportFiltersSchema.parse(rawFilters);
    const csv = await exportService.candidatesCsv(ctx, filters);
    const bytes = Buffer.from(csv, "utf8");
    const key = storageKeyFor(tenantId, exportId);
    await uploadPrivate(EXPORT_BUCKET, key, bytes, "text/csv; charset=utf-8");
    await reportExportRepository.markReady(ctx, exportId, key, bytes.byteLength, now);
    // Size and identifiers only. The CSV itself is candidate PII and never reaches a log line.
    logger.info("reports.export.stored", { exportId, byteSize: bytes.byteLength });
  },

  /** Mark an export dead after its last attempt, so the poller stops waiting for a file that is
   *  never coming. Records the `AppError` code only — a message can quote the data that broke. */
  /** Job-facing like `fulfil`: takes the payload's tenant, not a context it cannot have. */
  async fail(exportId: string, tenantId: string, errorCode: string): Promise<void> {
    await reportExportRepository.markFailed(systemContextFor(tenantId), exportId, errorCode);
  },
};
