import { randomUUID } from "node:crypto";
import { statusOrder } from "@destaworks/domain/constants";
import type { UploadCandidateResumeInput } from "@destaworks/contracts/validation/candidate";
import {
  resumeSchemaFor,
  type ExtractResumeResponse,
  type ParseResumeInput,
  type RequestResumeUploadUrlInput,
  type ResumeUploadUrlDTO,
  type SaveResumeInput,
} from "@destaworks/contracts/validation/resume";
import { parseResume } from "@destaworks/integrations/ai/parse-resume";
import type { TenantContext } from "@destaworks/domain/tenant";
import { writeAudit } from "@destaworks/db/audit";
import { withTransaction } from "@destaworks/db/with-transaction";
import { candidateRepository } from "@destaworks/db/repositories/candidate.repository";
import { documentRepository } from "@destaworks/db/repositories/document.repository";
import { AppError } from "@destaworks/integrations/http/app-error";
import {
  createSignedUploadUrl,
  getSignedDownloadUrl,
  persistedStorageKey,
  RESUME_BUCKET,
  unscopedStorageKey,
} from "@destaworks/integrations/storage";
import { toCandidateDTO } from "./candidate.dto";
import { toDocumentDTO } from "./document.dto";
import { toCandidateCreateInput } from "./resume.mapper";
import {
  classifyMatch,
  matchResumeToCandidate,
  normalizeEmail,
  normalizeName,
} from "./resume.match";

/** A storage-safe filename fragment — strips anything but alnum/dot/dash/underscore. */
function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(-100);
}

/**
 * Resume extraction + attach/create (Wave 1.2, Module 8). Orchestrates the Claude extraction,
 * the server-authoritative resume→candidate match, the lossy field mapper, and the atomic
 * attach-or-create + document persist + audit. AuthZ is the same posture as the candidate
 * pipeline — any signed-in user (the route calls `requireUser()`); no special capability.
 *
 * SECURITY: `extractedData`/`extractedText` are the heaviest PII/PHI surface in the app. They are
 * persisted but never logged, and are gated behind `viewCredentials` in `toDocumentDTO`.
 */

/** Only fill candidate fields that are currently EMPTY (OQ-2: attach never overwrites human data).
 *  Exported for reuse by `migration.service.ts`'s bulk resume-attach path — same conservative
 *  merge, one definition. */
export function fillEmptyFields(
  existing: Record<string, unknown>,
  mapped: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(mapped)) {
    if (value === null || value === undefined) continue;
    const current = existing[key];
    const isEmpty =
      current === null ||
      current === undefined ||
      current === "" ||
      (Array.isArray(current) && current.length === 0);
    if (isEmpty) out[key] = value;
  }
  return out;
}

export const resumeService = {
  /**
   * Extract a resume and compute the match against the current candidate list. Writes NOTHING —
   * returns the validated structured data + the match so the UI can render the review/confirm step.
   */
  async extract(input: ParseResumeInput): Promise<ExtractResumeResponse> {
    const data = await parseResume(input);
    const candidates = await candidateRepository.listForMatch();
    const match = matchResumeToCandidate(data, candidates);
    return { variant: input.variant, data, match };
  },

  /**
   * Persist the reviewed resume: attach to an existing candidate or create a new one, store the
   * document (structured data + text), and write the audit — all in ONE transaction.
   *
   * Server-authoritative invariant (§5): `candidateId` is set ONLY when the recomputed match is
   * `auto`, OR the request echoes a `confirmedCandidateId` that the server re-classifies as
   * `auto`/`confirm`. A below-threshold or absent confirmation creates a NEW candidate — the
   * client's match is never trusted.
   */
  async save(input: SaveResumeInput, ctx: TenantContext) {
    // Re-validate the (client-editable) structured data against the variant's schema.
    const data = resumeSchemaFor(input.variant).parse(input.data);

    // Recompute the match server-side; resolve the attach target.
    const candidates = await candidateRepository.listForMatch();
    const match = matchResumeToCandidate(data, candidates);

    let candidateId: string | null = null;
    if (match.status === "auto") {
      candidateId = match.candidateId;
    } else if (input.confirmedCandidateId) {
      const confirmed = candidates.find((c) => c.id === input.confirmedCandidateId);
      // Only honor the echoed id if the SERVER re-match classifies it as auto/confirm.
      if (confirmed && classifyMatch(data, confirmed) !== "none") {
        candidateId = confirmed.id;
      }
    }

    const mapped = toCandidateCreateInput(input.variant, data);

    return withTransaction(async (tx) => {
      let candidate;
      let action: "attach" | "create";

      if (!candidateId && match.status === "none") {
        const lockKey = `resume-create:${normalizeName(data.name)}:${data.email ? normalizeEmail(data.email) : ""}`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
        const freshCandidates = await candidateRepository.listForMatch(false, tx);
        const freshMatch = matchResumeToCandidate(data, freshCandidates);
        if (freshMatch.status !== "none") {
          candidateId = freshMatch.candidateId;
        }
      }

      if (candidateId) {
        const existing = await candidateRepository.findById(candidateId, undefined, tx);
        if (!existing) throw new AppError("NOT_FOUND", "Candidate not found");
        // OQ-2: attach the document + fill only empty candidate fields (no destructive overwrite).
        const fills = fillEmptyFields(
          existing as unknown as Record<string, unknown>,
          mapped as unknown as Record<string, unknown>,
        );
        candidate =
          Object.keys(fills).length > 0
            ? await candidateRepository.update(existing.id, fills, tx)
            : existing;
        action = "attach";
      } else {
        // New candidates always start at stage 0 (create never sets a status — same as the service).
        candidate = await candidateRepository.create(
          {
            ...mapped,
            status: "NEW_CANDIDATE",
            stageOrder: statusOrder("NEW_CANDIDATE"),
            createdById: ctx.user.id,
          },
          tx,
        );
        action = "create";
      }

      const document = await documentRepository.create(
        {
          candidateId: candidate.id,
          type: "resume",
          originalFilename: input.originalFilename,
          mimeType: input.mimeType,
          extractedText: input.extractedText,
          extractedData: data,
          storageKey: input.storageKey ?? null,
          uploadedById: ctx.user.id,
        },
        tx,
      );

      await writeAudit(tx, {
        entity: "document",
        entityId: document.id,
        actor: ctx.user.id,
        action,
      });

      return {
        candidate: toCandidateDTO(candidate, ctx),
        document: toDocumentDTO(document, ctx),
      };
    });
  },

  /**
   * Attach a resume directly to an ALREADY-KNOWN candidate (the candidate detail page's own
   * Resume tab) — unlike `save()`, there's no candidate to match/create and no AI field
   * extraction; this just persists whatever text/storage key the browser already produced
   * (pdf.js text extraction + an optional Storage PUT) as a new `Document`.
   */
  async attachToCandidate(
    candidateId: string,
    input: UploadCandidateResumeInput,
    ctx: TenantContext,
  ) {
    const candidate = await candidateRepository.findById(candidateId);
    if (!candidate) throw new AppError("NOT_FOUND", "Candidate not found");

    return withTransaction(async (tx) => {
      const document = await documentRepository.create(
        {
          candidateId,
          type: "resume",
          originalFilename: input.originalFilename,
          mimeType: input.mimeType,
          extractedText: input.extractedText ?? null,
          storageKey: input.storageKey ?? null,
          uploadedById: ctx.user.id,
        },
        tx,
      );
      await writeAudit(tx, {
        entity: "document",
        entityId: document.id,
        actor: ctx.user.id,
        action: "upload",
      });
      return toDocumentDTO(document, ctx);
    });
  },

  /**
   * A short-lived URL the browser PUTs the raw resume bytes to directly (Wave 6) — the file never
   * passes through our own server. Writes nothing; `save()` persists the resulting `storageKey`
   * once the upload succeeds and the user confirms.
   */
  async requestUploadUrl(input: RequestResumeUploadUrlInput): Promise<ResumeUploadUrlDTO> {
    // 6.6: this belongs at `t/<tenantId>/<uuid>-<filename>`, which becomes a one-line change
    // (`tenantStorageKey(ctx.tenantId, …)`) the moment 6.5 gives this method a tenant. Until then
    // the exception is declared rather than assumed — see `unscopedStorageKey`.
    const key = unscopedStorageKey(
      `${randomUUID()}-${sanitizeFilename(input.filename)}`,
      "resume-upload-awaiting-6.5-tenant-resolution",
    );
    const { signedUrl } = await createSignedUploadUrl(RESUME_BUCKET, key, input.mimeType);
    return { signedUrl, storageKey: key };
  },

  /**
   * A fresh, short-lived download URL for a document's stored resume bytes (Wave 6) — generated
   * on demand, never persisted. Callers gate this on `viewCredentials` (same PII/PHI tier as
   * `extractedText`/`extractedData`) before calling.
   */
  async getDownloadUrl(documentId: string): Promise<{ url: string }> {
    const doc = await documentRepository.findById(documentId);
    if (!doc?.storageKey) throw new AppError("NOT_FOUND", "No stored file for this document");
    const url = await getSignedDownloadUrl(RESUME_BUCKET, persistedStorageKey(doc.storageKey), 300);
    return { url };
  },
};
