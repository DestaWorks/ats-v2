import { hasCapability } from "@destaworks/domain/constants";
import { createCandidateSchema } from "@destaworks/contracts/validation/candidate";
import { boardQuerySchema } from "@destaworks/contracts/validation/pipeline";
import { decodeCursor } from "@destaworks/contracts/validation/cursor";
import { defined } from "@destaworks/domain/utils/defined";
import { requireUser } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { AppError } from "@destaworks/integrations/http/app-error";
import { candidateService } from "@destaworks/application/candidate.service";
import { toCandidateDTO } from "@destaworks/application/candidate.dto";
import type { CandidateEnvelope } from "@destaworks/application/candidate.wire";
import type { BoardResponse, ColumnPageDTO } from "@destaworks/contracts/validation/pipeline";

/** Wire shape of `GET /api/candidates` — the full board, or one column page when `column` is set. */
export type GetCandidatesResponse = BoardResponse | ColumnPageDTO;

/** Wire shape of `POST /api/candidates` — the PII-re-gated newly created candidate. */
export type PostCandidateResponse = CandidateEnvelope;

/**
 * GET /api/candidates — funnel-grouped pipeline board data (+ per-column load-more). Guarded by
 * `requireUser()` (any signed-in user works the pipeline). Filters
 * (status/track/clientId/search/tags/licenseStatus/mine/overdue/stuck/includeTerminal) are read
 * from `searchParams` and zod-validated. `mine` is a presence flag — the SERVICE resolves
 * `createdById` from `viewer.id`, so a client-supplied user id is never trusted.
 *
 * When `column=<activeStatus>` is present the route switches to single-column load-more mode:
 * `cursor` (opaque keyset) is decoded (malformed → 400) and delegated to `listColumn`, returning a
 * `ColumnPageDTO`. Otherwise it returns the full `BoardResponse` (columns + terminal + meta).
 */
export const GET = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const params = new URL(req.url).searchParams;
  const { includeTerminal, column, cursor, ...filters } = boardQuerySchema.parse({
    status: params.get("status") ?? undefined,
    track: params.get("track") ?? undefined,
    clientId: params.get("clientId") ?? undefined,
    search: params.get("search") ?? undefined,
    tags: params.get("tags") ?? undefined,
    licenseStatus: params.get("licenseStatus") ?? undefined,
    ownerId: params.get("ownerId") ?? undefined,
    mine: params.get("mine") ?? undefined,
    overdue: params.get("overdue") ?? undefined,
    stuck: params.get("stuck") ?? undefined,
    includeTerminal: params.get("includeTerminal") ?? undefined,
    column: params.get("column") ?? undefined,
    cursor: params.get("cursor") ?? undefined,
  });

  if (column) {
    let decoded;
    if (cursor) {
      decoded = decodeCursor(cursor, "createdAt_desc");
      if (!decoded) throw new AppError("BAD_REQUEST", "Invalid cursor");
    }
    const page = await candidateService.listColumn(column, defined(filters), user, decoded);
    return json<GetCandidatesResponse>(page);
  }

  const board = await candidateService.listBoard(
    defined(filters),
    user,
    defined({ includeTerminal }),
  );
  return json<GetCandidatesResponse>(board);
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
  const created = await candidateService.create(defined(input));
  return json<PostCandidateResponse>({ candidate: toCandidateDTO(created, user) }, 201);
});
