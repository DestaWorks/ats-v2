import { addProspectSchema } from "@/lib/validation/prospect";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { prospectService } from "@/server/services/prospect.service";

/**
 * POST /api/prospects — add a prospect manually (Client Discovery). Leadership-gated
 * (`viewClientDiscovery`). `addProspectSchema.strict()` rejects any unknown/forbidden key (no
 * `status`/`source` — a manual create always starts at "Fresh Lead" / "Manual"; the service
 * forces both). Returns the created prospect's detail DTO with a 201.
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireCapability("viewClientDiscovery");
  const input = addProspectSchema.parse(await req.json());
  const prospect = await prospectService.create(input, user);
  return json({ prospect }, 201);
});
