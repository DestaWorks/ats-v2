import "server-only";
import { statusOrder } from "@/lib/constants";
import {
  resumeSchemaFor,
  type ExtractResumeResponse,
  type ParseResumeInput,
  type SaveResumeInput,
} from "@/lib/validation/resume";
import { parseResume } from "@/server/ai/parse-resume";
import type { AuthUser } from "@/server/auth/guards";
import { writeAudit } from "@/server/db/audit";
import { withTransaction } from "@/server/db/with-transaction";
import { candidateRepository } from "@/server/repositories/candidate.repository";
import { documentRepository } from "@/server/repositories/document.repository";
import { AppError } from "@/server/http/app-error";
import { toCandidateDTO } from "./candidate.dto";
import { toDocumentDTO } from "./document.dto";
import { toCandidateCreateInput } from "./resume.mapper";
import { classifyMatch, matchResumeToCandidate } from "./resume.match";

/**
 * Résumé extraction + attach/create (Wave 1.2, Module 8). Orchestrates the Claude extraction,
 * the server-authoritative résumé→candidate match, the lossy field mapper, and the atomic
 * attach-or-create + document persist + audit. AuthZ is the same posture as the candidate
 * pipeline — any signed-in user (the route calls `requireUser()`); no special capability.
 *
 * SECURITY: `extractedData`/`extractedText` are the heaviest PII/PHI surface in the app. They are
 * persisted but never logged, and are gated behind `viewCredentials` in `toDocumentDTO`.
 */

/** Only fill candidate fields that are currently EMPTY (OQ-2: attach never overwrites human data). */
function fillEmptyFields(
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
   * Extract a résumé and compute the match against the current candidate list. Writes NOTHING —
   * returns the validated structured data + the match so the UI can render the review/confirm step.
   */
  async extract(input: ParseResumeInput): Promise<ExtractResumeResponse> {
    const data = await parseResume(input);
    const candidates = await candidateRepository.list({});
    const match = matchResumeToCandidate(data, candidates);
    return { variant: input.variant, data, match };
  },

  /**
   * Persist the reviewed résumé: attach to an existing candidate or create a new one, store the
   * document (structured data + text), and write the audit — all in ONE transaction.
   *
   * Server-authoritative invariant (§5): `candidateId` is set ONLY when the recomputed match is
   * `auto`, OR the request echoes a `confirmedCandidateId` that the server re-classifies as
   * `auto`/`confirm`. A below-threshold or absent confirmation creates a NEW candidate — the
   * client's match is never trusted.
   */
  async save(input: SaveResumeInput, user: AuthUser) {
    // Re-validate the (client-editable) structured data against the variant's schema.
    const data = resumeSchemaFor(input.variant).parse(input.data);

    // Recompute the match server-side; resolve the attach target.
    const candidates = await candidateRepository.list({});
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
            createdById: user.id,
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
          uploadedById: user.id,
        },
        tx,
      );

      await writeAudit(tx, {
        entity: "document",
        entityId: document.id,
        actor: user.id,
        action,
      });

      return {
        candidate: toCandidateDTO(candidate, user),
        document: toDocumentDTO(document, user),
      };
    });
  },
};
