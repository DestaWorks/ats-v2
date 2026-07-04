import { importInputSchema } from "@/lib/validation/migration";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { migrationService } from "@/server/services/migration.service";

/**
 * POST /api/migration/commit — idempotent upsert of the legacy candidates keyed on `legacy_id`
 * (chunked, continue-on-error), plus per-candidate + summary audit. Re-running never duplicates.
 * Guarded by `requireCapability("bulkImport")`. Same body as /prepare; a `checksum` mismatch is a
 * non-blocking warning in the report (E-7).
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireCapability("bulkImport");
  const input = importInputSchema.parse(await req.json());
  const report = await migrationService.commit(input, user);
  return json(report);
});
