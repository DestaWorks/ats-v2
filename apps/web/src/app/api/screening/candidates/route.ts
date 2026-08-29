import { requireUser } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { screeningService } from "@destaworks/application/screening.service";
import type { ScreeningCandidateListEnvelope } from "@destaworks/contracts/validation/envelopes";

/** Wire shape of `GET /api/screening/candidates` — the picker's eligible-stage candidates. */
export type GetScreeningCandidatesResponse = ScreeningCandidateListEnvelope;

/**
 * GET /api/screening/candidates?search= — the Screening picker's candidate list, scoped to the
 * 3 legacy-eligible stages (Wave 3.3). Open to any signed-in operator, matches `POST /api/leads`.
 */
export const GET = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const search = new URL(req.url).searchParams.get("search")?.trim() || undefined;
  const candidates = await screeningService.listEligibleCandidates(user, search);
  return json<GetScreeningCandidatesResponse>({ candidates });
});
