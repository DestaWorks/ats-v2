import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { mentionService } from "@/server/services/mention.service";
import type { MentionListDTO } from "@/lib/validation/mention";

/** Wire shape of `GET /api/mentions` — the session user's mentions + unread badge count. */
export type GetMentionsResponse = MentionListDTO;

/**
 * GET /api/mentions — the SESSION user's @mentions + unread badge count (`ats_get_mentions`
 * parity). The recipient is always the session — there is deliberately no `recipientEmail`
 * param (the legacy let any caller read anyone's mentions by email). 401 unauth.
 */
export const GET = apiHandler(async () => {
  const user = await requireUser();
  return json<GetMentionsResponse>(await mentionService.listMine(user));
});
