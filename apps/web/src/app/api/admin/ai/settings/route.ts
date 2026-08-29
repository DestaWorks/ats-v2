import { setAiDisabledSchema, type AiSettingsDTO } from "@destaworks/contracts/validation/ai-ops";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { aiOpsService } from "@destaworks/application/ai-ops.service";

/** Response body of `GET /api/admin/ai/settings`. */
export type GetAdminAiSettingsResponse = AiSettingsDTO;

/** Response body of `PATCH /api/admin/ai/settings`. */
export type PatchAdminAiSettingsResponse = AiSettingsDTO;

export const GET = apiHandler(async () => {
  const actor = await requireCapability("manageAiSettings");
  return json<GetAdminAiSettingsResponse>(await aiOpsService.getSettings(actor));
});

export const PATCH = apiHandler(async (req: Request) => {
  const actor = await requireCapability("manageAiSettings");
  const input = setAiDisabledSchema.parse(await req.json());
  return json<PatchAdminAiSettingsResponse>(
    await aiOpsService.setDisabled(actor, input.disabled, input.reason),
  );
});
