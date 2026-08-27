import {
  addProspectSchema,
  type ProspectDetailDTO,
} from "@destaworks/contracts/validation/prospect";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { prospectService } from "@destaworks/application/prospect.service";

/** Response body of `POST /api/prospects`. */
export type PostProspectResponse = { prospect: ProspectDetailDTO };

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
  return json<PostProspectResponse>({ prospect }, 201);
});
