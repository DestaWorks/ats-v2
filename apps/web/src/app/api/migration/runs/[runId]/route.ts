import type { MigrationRunState } from "@destaworks/contracts/validation/migration";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { migrationRunService } from "@destaworks/application/migration-run.service";

/** Response body of `GET /api/migration/runs/:runId` — one ETL run's status. */
export type GetMigrationRunResponse = MigrationRunState;

/**
 * GET /api/migration/runs/:runId — where an import got to (Phase 5).
 *
 * This is the half of the asynchronous commit that makes it operable: `status` says whether it
 * finished, `processedRows`/`totalRows` say how far it got, `updatedAt` separates a slow run from
 * a stuck one, and `report` carries the same `ImportReport` the synchronous commit used to return.
 *
 * Gated on `bulkImport`, the same capability as starting one: the report names the candidates that
 * were imported, so reading it is not a lesser privilege than causing it.
 */
export const GET = apiHandler<{ params: Promise<{ runId: string }> }>(async (_req, ctx) => {
  const user = await requireCapability("bulkImport");
  const { runId } = await ctx.params;
  return json<GetMigrationRunResponse>(await migrationRunService.state(user, runId));
});
