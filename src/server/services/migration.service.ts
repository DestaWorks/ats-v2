import "server-only";
import { createHash } from "node:crypto";
import { hasCapability } from "@/lib/constants";
import type {
  EmailDuplicateGroup,
  ImportInput,
  ImportReport,
  ImportRowReport,
} from "@/lib/validation/migration";
import type { AuthUser } from "@/server/auth/guards";
import { writeAudit } from "@/server/db/audit";
import { withTransaction } from "@/server/db/with-transaction";
import { candidateRepository } from "@/server/repositories/candidate.repository";
import { clientRepository } from "@/server/repositories/client.repository";
import { documentRepository } from "@/server/repositories/document.repository";
import { AppError } from "@/server/http/app-error";
import {
  dedupeByEmail,
  normalizeClientKey,
  transformRow,
  type ImportRowPlan,
} from "./candidate-import.transform";
import { parseSheet } from "./sheet-parse";

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
}

/** Parse → transform → resolve add/update against the DB → dedupe. No writes. Shared by both ops. */
async function planImport(input: ImportInput): Promise<Planned> {
  const { rows, parseErrors } = parseSheet(input.content, input.format);
  const checksum = createHash("sha256").update(input.content).digest("hex");

  const clients = await clientRepository.list();
  const clientsByName = new Map<string, string>();
  for (const c of clients) {
    clientsByName.set(normalizeClientKey(c.name), c.id);
    if (c.legacyId) clientsByName.set(normalizeClientKey(c.legacyId), c.id);
  }

  const existing = await candidateRepository.list({ includeDeleted: true });
  const existingLegacyIds = new Set(
    existing.map((c) => c.legacyId).filter((id): id is string => Boolean(id)),
  );

  // rowNumber: +2 = 1-indexed data row past the header (matches a spreadsheet's line numbers).
  const plans = rows.map((row, i) => transformRow(row, i + 2, clientsByName));
  for (const p of plans) {
    if (p.action === "error" || p.softDeleted) continue;
    p.action = existingLegacyIds.has(p.legacyId) ? "update" : "add";
  }

  const groups = dedupeByEmail(
    plans,
    existing.map((c) => ({
      legacyId: c.legacyId,
      email: c.email,
      updatedAt: c.updatedAt,
      createdAt: c.createdAt,
    })),
  );

  return { plans, groups, checksum, parseErrors };
}

function toRowReport(plan: ImportRowPlan): ImportRowReport {
  const reasons = [...new Set([...plan.errors, ...plan.flags, ...plan.notes])];
  return { legacyId: plan.legacyId, name: plan.name, action: plan.action, reasons };
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
  return report;
}

export const migrationService = {
  /** Parse + transform + dedupe → a diffable report. Writes NOTHING. */
  async prepare(input: ImportInput, user: AuthUser): Promise<ImportReport> {
    assertCanImport(user);
    return buildReport(await planImport(input));
  },

  /**
   * Idempotent commit: one transaction per non-error, non-skip row — `upsertByLegacyId`
   * (+ optional résumé document upsert) + a per-candidate `import` audit — continue-on-error so a
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
      try {
        await withTransaction(async (tx) => {
          const candidate = await candidateRepository.upsertByLegacyId(
            plan.legacyId,
            plan.create,
            plan.update,
            tx,
          );
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
