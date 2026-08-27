import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { credentialsIntelligenceService } from "@destaworks/application/credentials-intelligence.service";
import type { CredentialsOverviewDTO } from "@destaworks/contracts/validation/credentials";

/** Wire shape of `GET /api/credentials/overview` — the Credentials Intelligence snapshot. */
export type GetCredentialsOverviewResponse = CredentialsOverviewDTO;

/**
 * GET /api/credentials/overview — the Credentials Intelligence leadership dashboard (Wave 3.6).
 * Guarded by `requireCapability("viewCredentials")` at the route for defense-in-depth — the
 * page itself also self-gates (server-authoritative). No query params: this is a single
 * point-in-time snapshot, not a paginated/filtered read.
 */
export const GET = apiHandler(async () => {
  await requireCapability("viewCredentials");
  return json<GetCredentialsOverviewResponse>(await credentialsIntelligenceService.overview());
});
