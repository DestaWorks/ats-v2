import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { templatePerformanceService } from "@/server/services/template-performance.service";

/**
 * GET /api/templates/performance — usage + response-rate per template (Wave 4.1). Gated behind
 * `requireCapability("viewAnalytics")` (leadership) — legacy had this open to any operator, but
 * this matches the app's established convention for aggregate analytics dashboards
 * (Credentials Intelligence used `viewCredentials`).
 */
export const GET = apiHandler(async () => {
  await requireCapability("viewAnalytics");
  return json(await templatePerformanceService.overview());
});
