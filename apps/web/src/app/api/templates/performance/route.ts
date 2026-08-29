import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { templatePerformanceService } from "@destaworks/application/template-performance.service";
import type { TemplatePerformanceDTO } from "@destaworks/contracts/validation/template-performance";

/** Wire shape of `GET /api/templates/performance` — usage + response-rate per template. */
export type GetTemplatePerformanceResponse = TemplatePerformanceDTO;

/**
 * GET /api/templates/performance — usage + response-rate per template (Wave 4.1). Gated behind
 * `requireCapability("viewAnalytics")` (leadership) — legacy had this open to any operator, but
 * this matches the app's established convention for aggregate analytics dashboards
 * (Credentials Intelligence used `viewCredentials`).
 */
export const GET = apiHandler(async () => {
  const actor = await requireCapability("viewAnalytics");
  return json<GetTemplatePerformanceResponse>(await templatePerformanceService.overview(actor));
});
