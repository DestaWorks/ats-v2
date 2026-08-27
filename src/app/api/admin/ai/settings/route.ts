import { setAiDisabledSchema, type AiSettingsDTO } from "@/lib/validation/ai-ops";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { aiOpsService } from "@/server/services/ai-ops.service";

/** Response body of `GET /api/admin/ai/settings`. */
export type GetAdminAiSettingsResponse = AiSettingsDTO;

/** Response body of `PATCH /api/admin/ai/settings`. */
export type PatchAdminAiSettingsResponse = AiSettingsDTO;

export const GET = apiHandler(async () => {
  await requireCapability("manageAiSettings");
  return json<GetAdminAiSettingsResponse>(await aiOpsService.getSettings());
});

export const PATCH = apiHandler(async (req: Request) => {
  const actor = await requireCapability("manageAiSettings");
  const input = setAiDisabledSchema.parse(await req.json());
  return json<PatchAdminAiSettingsResponse>(
    await aiOpsService.setDisabled(input.disabled, actor, input.reason),
  );
});
