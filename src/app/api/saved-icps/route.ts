import { createSavedIcpSchema, type SavedIcpDTO } from "@/lib/validation/saved-icp";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { savedIcpService } from "@/server/services/saved-icp.service";

/** Response body of `GET /api/saved-icps`. */
export type GetSavedIcpsResponse = { savedIcps: SavedIcpDTO[] };

/** Response body of `POST /api/saved-icps` (201). */
export type PostSavedIcpResponse = { savedIcp: SavedIcpDTO };

/**
 * GET /api/saved-icps — every ICP visible to the caller: all team-shared ones + the caller's own
 * private ones (mirrors `GET /api/saved-views`, minus the `scope` param — an ICP only ever
 * belongs to Client Discovery's one search).
 */
export const GET = apiHandler(async () => {
  const user = await requireCapability("viewClientDiscovery");
  const savedIcps = await savedIcpService.list(user);
  return json<GetSavedIcpsResponse>({ savedIcps });
});

/**
 * POST /api/saved-icps — save the current NPPES search filter under a name. 409 CONFLICT if the
 * caller already has an ICP by that name.
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireCapability("viewClientDiscovery");
  const input = createSavedIcpSchema.parse(await req.json());
  const savedIcp = await savedIcpService.create(input, user);
  return json<PostSavedIcpResponse>({ savedIcp }, 201);
});
