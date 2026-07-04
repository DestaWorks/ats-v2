import { importInputSchema } from "@/lib/validation/migration";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { migrationService } from "@/server/services/migration.service";

/**
 * POST /api/migration/prepare — parse + transform + dedupe the legacy Sheet export into a diffable
 * `ImportReport`. Writes NOTHING. Guarded by `requireCapability("bulkImport")` (a leadership
 * capability). The client re-uploads the same `content` to /commit (stateless hand-off, E-7).
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireCapability("bulkImport");
  const input = importInputSchema.parse(await req.json());
  const report = await migrationService.prepare(input, user);
  return json(report);
});
