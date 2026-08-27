import { saveInboundLeadSchema } from "@destaworks/contracts/validation/inbound";
import type { LeadDetailDTO } from "@destaworks/contracts/validation/lead";
import { requireUser } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { inboundService } from "@destaworks/application/inbound.service";

/** Response body of `POST /api/inbound/save`. */
export type PostInboundSaveResponse = { lead: LeadDetailDTO };

/**
 * POST /api/inbound/save — save the (possibly reviewer-edited) triage extraction as a fresh Source
 * Lead, Responded Hot, with the pasted message logged as the first outreach attempt (Wave 2.8).
 * Guarded by `requireUser()` (L-7). Returns the created lead's detail DTO with a 201.
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const input = saveInboundLeadSchema.parse(await req.json());
  const lead = await inboundService.saveAsLead(input, user);
  return json<PostInboundSaveResponse>({ lead }, 201);
});
