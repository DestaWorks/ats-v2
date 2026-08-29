import {
  importInputSchema,
  type MigrationCommitAccepted,
} from "@destaworks/contracts/validation/migration";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { checkRateLimit } from "@destaworks/integrations/http/rate-limit";
import { migrationRunService } from "@destaworks/application/migration-run.service";

/** Response body of `POST /api/migration/commit` — the queued run, not its result. */
export type PostMigrationCommitResponse = MigrationCommitAccepted;

/**
 * POST /api/migration/commit — stage the export and queue the ETL. Answers `202` with a run id;
 * the import itself runs as a `migration.commit` job and the client polls
 * `GET /api/migration/runs/:runId` for progress and the final report (Phase 5).
 *
 * `maxDuration` is gone with the work: what is left is a hash, one insert and an enqueue. The
 * commit was the one operation in this app that could not fit in the platform's 300s ceiling, and
 * capping it there only meant a large import was cut off partway with no record of where.
 *
 * Still `bulkImport`-guarded and still rate-limited per user — the bucket now meters how often
 * someone can queue an import rather than how often they can run one, which matters more, since a
 * queued run costs worker time whether or not the caller waits for it.
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireCapability("bulkImport");
  await checkRateLimit(`migration-commit:${user.user.id}`, { limit: 10, windowMs: 60_000 });
  const input = importInputSchema.parse(await req.json());
  const accepted = await migrationRunService.start(input, user);
  return json<PostMigrationCommitResponse>(accepted, 202);
});
