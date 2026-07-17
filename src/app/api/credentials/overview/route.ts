import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { credentialsIntelligenceService } from "@/server/services/credentials-intelligence.service";

/**
 * GET /api/credentials/overview — the Credentials Intelligence leadership dashboard (Wave 3.6).
 * Guarded by `requireCapability("viewCredentials")` at the route for defense-in-depth — the
 * page itself also self-gates (server-authoritative). No query params: this is a single
 * point-in-time snapshot, not a paginated/filtered read.
 */
export const GET = apiHandler(async () => {
  await requireCapability("viewCredentials");
  return json(await credentialsIntelligenceService.overview());
});
