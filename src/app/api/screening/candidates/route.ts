import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { screeningService } from "@/server/services/screening.service";
import type { ScreeningCandidateDTO } from "@/lib/validation/screening";

/** Wire shape of `GET /api/screening/candidates` — the picker's eligible-stage candidates. */
export interface GetScreeningCandidatesResponse {
  candidates: ScreeningCandidateDTO[];
}

/**
 * GET /api/screening/candidates?search= — the Screening picker's candidate list, scoped to the
 * 3 legacy-eligible stages (Wave 3.3). Open to any signed-in operator, matches `POST /api/leads`.
 */
export const GET = apiHandler(async (req: Request) => {
  await requireUser();
  const search = new URL(req.url).searchParams.get("search")?.trim() || undefined;
  const candidates = await screeningService.listEligibleCandidates(search);
  return json<GetScreeningCandidatesResponse>({ candidates });
});
