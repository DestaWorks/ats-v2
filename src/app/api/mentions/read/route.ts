import { markMentionReadSchema } from "@/lib/validation/mention";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { mentionService } from "@/server/services/mention.service";

/**
 * POST /api/mentions/read — mark one mention (`{ mentionId }`) or all of the session user's
 * mentions (`{ all: true }`) read (`ats_mark_mention_read` parity). Recipient scoping is the
 * service's (session-only). Returns the fresh unread count. 404 someone-else's/missing id;
 * 422 bad body; 401 unauth.
 */
export const POST = apiHandler(async (req) => {
  const user = await requireUser();
  const input = markMentionReadSchema.parse(await req.json());
  return json(await mentionService.markRead(input, user));
});
