import { bulkMoveInputSchema } from "@/lib/validation/pipeline";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { candidateService } from "@/server/services/candidate.service";

/**
 * POST /api/candidates/bulk-move — move many candidates at once. Guarded by `requireUser()`.
 * NO gate bypass: `candidateService.bulkMove` runs the same server-authoritative `move` (gate +
 * audit) for EVERY id, each in its own transaction, and returns a partial-success summary
 * (`moved` / `blocked[{ id, reason }]`) — one blocked candidate never rolls back the valid moves.
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const { ids, toStatus } = bulkMoveInputSchema.parse(await req.json());
  const result = await candidateService.bulkMove(ids, toStatus, user);
  return json(result);
});
