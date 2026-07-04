import { hasCapability } from "@/lib/constants";
import { createCandidateSchema } from "@/lib/validation/candidate";
import { boardQuerySchema } from "@/lib/validation/pipeline";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { AppError } from "@/server/http/app-error";
import { candidateService } from "@/server/services/candidate.service";
import { toCandidateDTO } from "@/server/services/candidate.dto";

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

/**
 * POST /api/candidates — manually create a candidate (Wave 2.4). Guarded by `requireUser()`
 * (working the pipeline is open to any signed-in user). `createCandidateSchema.strict()` rejects
 * status / pipeline-timing / license-VERIFICATION keys with a 422 — every interactive create starts
 * at `NEW_CANDIDATE` (the service forces stage 0, sets `createdById`). `licenseNumber` (sensitive
 * PII) is accepted ONLY for a viewer with `viewCredentials`; otherwise 403 (mirrors PATCH). Returns
 * the PII-re-gated candidate DTO with a 201. 401 / 403 / 422 as usual.
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const input = createCandidateSchema.parse(await req.json());
  if (input.licenseNumber !== undefined && !hasCapability(user.role, "viewCredentials")) {
    throw new AppError("FORBIDDEN", "You don't have permission to set the license number");
  }
  const created = await candidateService.create(input);
  return json({ candidate: toCandidateDTO(created, user) }, 201);
});
