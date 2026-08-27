import "server-only";
import { createHash } from "node:crypto";
import { hasCapability, DEFAULT_TRACK } from "@destaworks/domain/constants";
import {
  RESUME_VARIANTS,
  VARIANT_TO_TRACK,
  type ResumeVariant,
} from "@destaworks/domain/constants/documents";
import type {
  EmailDuplicateGroup,
  ImportInput,
  ImportReport,
  ImportResume,
  ImportRowReport,
} from "@destaworks/contracts/validation/migration";
import type { ResumeData } from "@destaworks/contracts/validation/resume";
import type { AuthUser } from "@destaworks/auth/guards";
import { parseResume } from "@destaworks/integrations/ai/parse-resume";
import { writeAudit } from "@destaworks/db/audit";
import { withTransaction } from "@destaworks/db/with-transaction";
import { candidateRepository } from "@destaworks/db/repositories/candidate.repository";
import { clientRepository } from "@destaworks/db/repositories/client.repository";
import { documentRepository } from "@destaworks/db/repositories/document.repository";
import { AppError } from "@destaworks/integrations/http/app-error";
import { checkRateLimit } from "@destaworks/integrations/http/rate-limit";
import { fillEmptyFields } from "./resume.service";
import { toCandidateCreateInput } from "./resume.mapper";
import {
  dedupeByEmail,
  normalizeClientKey,
  transformRow,
  type ImportRowPlan,
} from "./candidate-import.transform";
import { parseSheet } from "./sheet-parse";

/** Track label → resume variant, derived from the SAME table Wave 1.2 uses (never a second source
 *  of truth). Rows carry no explicit track from the Indrasur CSV — `DEFAULT_TRACK` ("Clinical")
 *  is what `transformRow` implicitly relies on today (via the DB column default), so that's the
 *  safe fallback here too. */
const TRACK_TO_VARIANT: Record<string, ResumeVariant> = Object.fromEntries(
  RESUME_VARIANTS.map((v) => [VARIANT_TO_TRACK[v], v]),
);

function variantForPlan(plan: ImportRowPlan): ResumeVariant {
  const track = String((plan.create as { track?: string }).track ?? DEFAULT_TRACK);
  return TRACK_TO_VARIANT[track] ?? "clinical";
}

/**
 * Match uploaded resume texts to plan rows by normalized name (Wave 1.3 backlog, the "Indrasur"
 * bulk-resume flow). UNLIKE legacy's filename-prefix matcher: a collision in EITHER direction
 * (>1 resume file for one name, or >1 row sharing a name) marks every affected row `"ambiguous"`
 * rather than silently letting one file win; a resume file matching no row is collected into
 * `unmatchedFiles` rather than silently discarded; a row with no resume still imports normally
 * (`resumeMatch: "none"`) rather than being hard-blocked from commit.
 */
function matchResumes(plans: ImportRowPlan[], resumes: ImportResume[] | undefined): string[] {
  for (const p of plans) {
    p.resumeMatch = "none";
    p.resumeText = null;
  }
  if (!resumes || resumes.length === 0) return [];

  const filesByKey = new Map<string, ImportResume[]>();
  for (const r of resumes) {
    const key = r.filenamePrefix.trim().toLowerCase();
    filesByKey.set(key, [...(filesByKey.get(key) ?? []), r]);
  }

  const plansByKey = new Map<string, ImportRowPlan[]>();
  for (const p of plans) {
    const key = p.name.trim().toLowerCase();
    plansByKey.set(key, [...(plansByKey.get(key) ?? []), p]);
  }

  const usedKeys = new Set<string>();
  for (const [key, filesForKey] of filesByKey) {
    const plansForKey = plansByKey.get(key);
    if (!plansForKey || plansForKey.length === 0) continue; // reported as unmatched below
    usedKeys.add(key);
    const [file] = filesForKey;
    const ambiguous = filesForKey.length > 1 || plansForKey.length > 1;
    for (const p of plansForKey) {
      if (ambiguous || file === undefined) {
        p.resumeMatch = "ambiguous";
      } else {
        p.resumeMatch = "matched";
        p.resumeText = file.text;
        p.resumeFilename = file.originalFilename;
        p.resumeStorageKey = file.storageKey ?? null;
      }
    }
  }

  const unmatchedFiles: string[] = [];
  for (const [key, filesForKey] of filesByKey) {
    if (!usedKeys.has(key)) unmatchedFiles.push(...filesForKey.map((f) => f.originalFilename));
  }
  return unmatchedFiles;
}

/**
 * Bulk-import / candidate ETL orchestration (Wave 1.3, Module 20). The pure pipeline (`sheet-parse`
 * → `candidate-import.transform` → `dedupeByEmail`) is shared by `prepare` (report, ZERO writes) and
 * `commit` (idempotent `upsertByLegacyId` per row, chunked continue-on-error). Re-running never
 * duplicates — `legacy_id` is the idempotency key.
 *
 * SECURITY: `bulkImport` is a leadership capability; the route guards with `requireCapability`, and
 * the service re-asserts it (defense in depth). PII (email/name/licenseNumber) is never logged; the
 * report exposes only the name already shown in-app.
 */

function assertCanImport(user: AuthUser): void {
  if (!hasCapability(user.role, "bulkImport")) {
    throw new AppError("FORBIDDEN", "You don't have permission to import");
  }
}

interface Planned {
  plans: ImportRowPlan[];
  groups: EmailDuplicateGroup[];
  checksum: string;
  parseErrors: string[];
  unmatchedResumeFiles: string[];
  /** Whether a resume ZIP was actually part of this request — distinguishes "0 matched because no
   *  ZIP was uploaded" from "0 matched despite a ZIP" so the report never shows a misleading stat. */
  resumesProvided: boolean;
}

/** Parse → transform → resolve add/update against the DB → dedupe → match resumes. No writes.
 *  Shared by both ops. */
async function planImport(input: ImportInput): Promise<Planned> {
  const { rows, parseErrors } = parseSheet(input.content, input.format);
  const checksum = createHash("sha256").update(input.content).digest("hex");

  const [clients, existing] = await Promise.all([
    clientRepository.list(),
    candidateRepository.listForDedupe(true),
  ]);
  const clientsByName = new Map<string, string>();
  for (const c of clients) {
    clientsByName.set(normalizeClientKey(c.name), c.id);
    if (c.legacyId) clientsByName.set(normalizeClientKey(c.legacyId), c.id);
  }

  const existingLegacyIds = new Set(
    existing.map((c) => c.legacyId).filter((id): id is string => Boolean(id)),
  );

  // rowNumber: +2 = 1-indexed data row past the header (matches a spreadsheet's line numbers).
  const plans = rows.map((row, i) => transformRow(row, i + 2, clientsByName));
  for (const p of plans) {
    if (p.action === "error" || p.softDeleted) continue;
    p.action = existingLegacyIds.has(p.legacyId) ? "update" : "add";
  }

  const groups = dedupeByEmail(plans, existing);

  const unmatchedResumeFiles = matchResumes(plans, input.resumes);
  const resumesProvided = Boolean(input.resumes && input.resumes.length > 0);

  return { plans, groups, checksum, parseErrors, unmatchedResumeFiles, resumesProvided };
}

function toRowReport(plan: ImportRowPlan): ImportRowReport {
  const reasons = [...new Set([...plan.errors, ...plan.flags, ...plan.notes])];
  if (plan.resumeMatch === "ambiguous" && !reasons.includes("resume-ambiguous")) {
    reasons.push("resume-ambiguous");
  }
  const report: ImportRowReport = {
    legacyId: plan.legacyId,
    name: plan.name,
    action: plan.action,
    reasons,
    resumeMatch: plan.resumeMatch ?? "none",
  };
  if (plan.resumeMatch === "matched" && plan.resumeFilename) {
    report.resumeFilename = plan.resumeFilename;
  }
  return report;
}

function buildReport(planned: Planned): ImportReport {
  const counts = { added: 0, updated: 0, softDeleted: 0, skipped: 0, flagged: 0, errored: 0 };
  for (const p of planned.plans) {
    if (p.action === "add") counts.added++;
    else if (p.action === "update") counts.updated++;
    else if (p.action === "softDelete") counts.softDeleted++;
    else if (p.action === "skip") counts.skipped++;
    else if (p.action === "error") counts.errored++;
    if (p.flags.length > 0) counts.flagged++;
  }
  const rows = planned.plans.map(toRowReport).sort((a, b) => a.legacyId.localeCompare(b.legacyId));
  const report: ImportReport = {
    counts,
    rows,
    emailDuplicateGroups: planned.groups,
    checksum: planned.checksum,
  };
  // Surface dropped/malformed rows the parser skipped — don't silently ignore them in a PII import.
  if (planned.parseErrors.length > 0) {
    report.warnings = planned.parseErrors.map((e) => `parse: ${e}`);
  }
  // Resume files that matched no row (Wave 1.3 backlog) — visible, never silently dropped.
  if (planned.unmatchedResumeFiles.length > 0) {
    report.unmatchedResumeFiles = planned.unmatchedResumeFiles;
  }
  // Legacy parity — "Resumes matched" / "No resume found" stats — only when a ZIP was actually
  // uploaded, so a CSV-only import never shows a misleading "0 matched".
  if (planned.resumesProvided) {
    const resumeCounts = { matched: 0, ambiguous: 0, none: 0 };
    for (const p of planned.plans) {
      resumeCounts[p.resumeMatch ?? "none"]++;
    }
    report.resumeCounts = resumeCounts;
  }
  return report;
}

/**
 * Attach one matched resume to its candidate (Wave 1.3 backlog, extended Wave 6). Always creates
 * the `Document` with the already-extracted text and, when the browser already PUT the file to
 * Storage, its `storageKey` — that part is free and never fails the row. On top of that, AI-parse
 * the resume into structured fields via Wave 1.2's REAL extraction schema/prompt (`parseResume`,
 * never legacy's own broken field-harvesting) and merge them in via the conservative "fill empty
 * fields only" pass (`fillEmptyFields`, `resume.service.ts`). Rate-limited per user since a bulk
 * commit can trigger many calls in a row. An AI failure (rate-limit, provider error, disabled)
 * marks the row `"ai-extraction-failed"` but still lets the document attach — the candidate itself
 * was already committed by the caller, so neither half ever blocks the batch.
 */
async function attachResumeWithAi(
  plan: ImportRowPlan,
  candidateId: string,
  resumeText: string,
  user: AuthUser,
): Promise<void> {
  let data: ResumeData | null = null;
  try {
    await checkRateLimit(`migration-resume-ai:${user.id}`, { limit: 20, windowMs: 60_000 });
    const variant = variantForPlan(plan);
    data = await parseResume({ variant, text: resumeText });
    const mapped = toCandidateCreateInput(variant, data) as unknown as Record<string, unknown>;

    await withTransaction(async (tx) => {
      const existing = await candidateRepository.findById(candidateId, undefined, tx);
      if (existing) {
        const fills = fillEmptyFields(existing as unknown as Record<string, unknown>, mapped);
        if (Object.keys(fills).length > 0) {
          await candidateRepository.update(candidateId, fills, tx);
        }
      }
    });
  } catch {
    // Never log the row (PII). Surface the failure instead of legacy's silent swallow — the
    // resume file/text below still attaches even when AI field-parsing fails, since that part
    // is free (client-side text extraction + a Storage PUT the browser already did).
    plan.errors.push("ai-extraction-failed");
  }

  await withTransaction(async (tx) => {
    const document = await documentRepository.upsertByLegacyId(
      `resume-ai:${plan.legacyId}`,
      {
        candidateId,
        type: "resume",
        originalFilename: plan.resumeFilename ?? `${plan.name}.pdf`,
        mimeType: "application/pdf",
        ...(plan.resumeText !== undefined && { extractedText: plan.resumeText }),
        extractedData: data ?? undefined,
        storageKey: plan.resumeStorageKey ?? null,
        uploadedById: user.id,
      },
      tx,
    );
    await writeAudit(tx, {
      entity: "document",
      entityId: document.id,
      actor: user.id,
      action: data ? "import-resume-ai" : "import-resume",
    });
  });
}

export const migrationService = {
  /** Parse + transform + dedupe → a diffable report. Writes NOTHING. */
  async prepare(input: ImportInput, user: AuthUser): Promise<ImportReport> {
    assertCanImport(user);
    return buildReport(await planImport(input));
  },

  /**
   * Idempotent commit: one transaction per non-error, non-skip row — `upsertByLegacyId`
   * (+ optional resume document upsert) + a per-candidate `import` audit — continue-on-error so a
   * single bad row can't abort the batch. Then one `import_batch` summary audit. Returns the
   * same-shape report with realized actions.
   */
  async commit(input: ImportInput, user: AuthUser): Promise<ImportReport> {
    assertCanImport(user);
    const planned = await planImport(input);

    const warnings: string[] = [];
    if (input.checksum && input.checksum !== planned.checksum) {
      // E-7: advisory only — legacy_id upsert makes a re-parse safe.
      warnings.push("checksum-mismatch");
    }

    for (const plan of planned.plans) {
      if (plan.action === "error" || plan.action === "skip") continue;
      let candidateId: string | null = null;
      try {
        await withTransaction(async (tx) => {
          const candidate = await candidateRepository.upsertByLegacyId(
            plan.legacyId,
            plan.create,
            plan.update,
            tx,
          );
          candidateId = candidate.id;
          if (plan.document) {
            await documentRepository.upsertByLegacyId(
              plan.document.legacyId,
              {
                candidateId: candidate.id,
                legacyId: plan.document.legacyId,
                legacyUrl: plan.document.legacyUrl,
                originalFilename: plan.document.originalFilename,
                type: plan.document.type,
                mimeType: plan.document.mimeType,
                uploadedById: user.id,
              },
              tx,
            );
          }
          await writeAudit(tx, {
            entity: "candidate",
            entityId: candidate.id,
            actor: user.id,
            action: "import",
          });
        });
      } catch {
        // Never log the row (PII). Mark it errored and continue.
        plan.action = "error";
        plan.errors.push("commit-failed");
        continue;
      }

      // Wave 1.3 backlog (Indrasur bulk-resume flow) — deliberately OUTSIDE the upsert transaction
      // (a paid, slow LLM call has no business holding a DB lock). Runs only for rows with an
      // unambiguously matched resume, and only when the caller opted in — this is also what
      // attaches the Storage file (Wave 6), not just the AI-parsed fields, since both are cheap/
      // free relative to the LLM call this same opt-in already gates.
      if (input.extractWithAi && plan.resumeMatch === "matched" && plan.resumeText && candidateId) {
        await attachResumeWithAi(plan, candidateId, plan.resumeText, user);
      }
    }

    const report = buildReport(planned);
    if (warnings.length > 0) report.warnings = [...(report.warnings ?? []), ...warnings];

    await withTransaction((tx) =>
      writeAudit(tx, {
        entity: "import_batch",
        entityId: planned.checksum,
        actor: user.id,
        action: "commit",
        after: report.counts,
      }),
    );

    return report;
  },
};
