import {
  findSimilarSchema,
  type FindSimilarResultDTO,
} from "@destaworks/contracts/validation/similarity";
import { requireUser } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { similarityService } from "@destaworks/application/similarity.service";

/** Response body of `POST /api/sourcing/similar`. */
export type PostSourcingSimilarResponse = FindSimilarResultDTO;

/**
 * POST /api/sourcing/similar — "find providers like this" (Wave 3.2, Smarter Sourcing). Open to
 * any signed-in operator (matches Discover/Screening — no capability gate). Body is just the
 * anchor's `{credential, state}`; results are net-new NPPES providers only (never our own DB),
 * ranked by state similarity. `BAD_REQUEST` (400) when the credential has no verified NPPES
 * taxonomy mapping yet.
 */
export const POST = apiHandler(async (req) => {
  const user = await requireUser();
  const input = findSimilarSchema.parse(await req.json());
  return json<PostSourcingSimilarResponse>(await similarityService.findSimilar(input, user));
});
