import { createClientSchema } from "@/lib/validation/client";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { clientService } from "@/server/services/client.service";

/**
 * GET /api/crm/clients — the full client list (small, fixed set — no pagination, matches
 * `clientRepository.list()`'s existing contract). POST adds a client. Both gated behind
 * `requireCapability("viewCrm")` — legacy gates the entire CRM view to leadership
 * (`index.html:1415`) and contact mutations to leadership/BD server-side (`Code.gs:151`).
 */
export const GET = apiHandler(async () => {
  await requireCapability("viewCrm");
  return json(await clientService.list());
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requireCapability("viewCrm");
  const input = createClientSchema.parse(await req.json());
  const client = await clientService.create(input, user);
  return json({ client }, 201);
});
