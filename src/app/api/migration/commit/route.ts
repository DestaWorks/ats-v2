import { importInputSchema } from "@/lib/validation/migration";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { checkRateLimit } from "@/server/http/rate-limit";
import { migrationService } from "@/server/services/migration.service";

/**
 * Allow the ETL commit up to the platform maximum — a large one-shot import can run for minutes.
 */
export const maxDuration = 300;

/**
 * POST /api/migration/commit — idempotent upsert of the legacy candidates keyed on `legacy_id`
 * (per-row continue-on-error; batching the upserts is a future optimization), plus per-candidate +
 * summary audit. Re-running never duplicates. Guarded by `requireCapability("bulkImport")`. Same
 * body as /prepare; a `checksum` mismatch is a non-blocking warning in the report (E-7).
 *
 * The commit is expensive (a full re-upsert), so it is rate-limited per user (best-effort,
 * in-memory — see `server/http/rate-limit`).
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireCapability("bulkImport");
  checkRateLimit(`migration-commit:${user.id}`, { limit: 10, windowMs: 60_000 });
  const input = importInputSchema.parse(await req.json());
  const report = await migrationService.commit(input, user);
  return json(report);
});
