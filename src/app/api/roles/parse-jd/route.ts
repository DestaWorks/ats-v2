import { parseJdSchema } from "@/lib/validation/open-role";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { openRoleService } from "@/server/services/open-role.service";

/**
 * POST /api/roles/parse-jd — paste a job description, AI extracts the role fields (legacy
 * `ats_parse_jd`). 503 FEATURE_DISABLED if AI is unconfigured; 502 EXTRACTION_FAILED on a failed
 * model call; 429 RATE_LIMITED if the provider is busy.
 */
export const POST = apiHandler(async (req: Request) => {
  await requireUser();
  const input = parseJdSchema.parse(await req.json());
  return json(await openRoleService.parseJd(input));
});
