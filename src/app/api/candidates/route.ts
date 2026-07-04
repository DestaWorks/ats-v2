import { boardQuerySchema } from "@/lib/validation/pipeline";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { candidateService } from "@/server/services/candidate.service";

/**
 * GET /api/candidates — funnel-grouped pipeline board data. Guarded by `requireUser()` (any
 * signed-in user works the pipeline). Filters (status/track/clientId/search/includeTerminal) are
 * read from `searchParams`, zod-validated, then delegated to `candidateService.listBoard`, which
 * owns the DTO shape + grouping. Returns the `BoardResponse` (columns + terminal + meta).
 */
export const GET = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const params = new URL(req.url).searchParams;
  const { includeTerminal, ...filters } = boardQuerySchema.parse({
    status: params.get("status") ?? undefined,
    track: params.get("track") ?? undefined,
    clientId: params.get("clientId") ?? undefined,
    search: params.get("search") ?? undefined,
    includeTerminal: params.get("includeTerminal") ?? undefined,
  });
  const board = await candidateService.listBoard(filters, user, { includeTerminal });
  return json(board);
});
