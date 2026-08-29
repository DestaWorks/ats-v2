import { Controller, Get, Inject, Param, UseGuards } from "@nestjs/common";
import type {
  GetCrmClientHealthResponse,
  GetCrmClientRevenueResponse,
  GetCrmCompareResponse,
} from "@destaworks/contracts/http/crm";
import type { AuthContext } from "@destaworks/auth/guards";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequireCapability } from "../../common/decorators/require-capability.decorator";
import { CapabilityGuard } from "../../common/guards/capability.guard";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import type { ServiceOf } from "../service-token";
import { CRM_ANALYTICS_SERVICE } from "./crm.tokens";

/**
 * The three derived views over CRM data — cross-client Compare, one client's health score, one
 * client's revenue and profitability. Reads only, and each is a single service call: the
 * aggregation is the service's, so nothing is assembled at this layer.
 */
@Controller("crm")
@UseGuards(SessionAuthGuard, CapabilityGuard)
@RequireCapability("viewCrm")
export class CrmAnalyticsController {
  constructor(
    @Inject(CRM_ANALYTICS_SERVICE)
    private readonly analytics: ServiceOf<typeof CRM_ANALYTICS_SERVICE>,
  ) {}

  @Get("compare")
  async compare(@CurrentUser() user: AuthContext): Promise<GetCrmCompareResponse> {
    return { clients: await this.analytics.compare(user) };
  }

  @Get("clients/:id/health")
  async healthScore(
    @Param("id") clientId: string,
    @CurrentUser() user: AuthContext,
  ): Promise<GetCrmClientHealthResponse> {
    return this.analytics.healthScore(clientId, user);
  }

  @Get("clients/:id/revenue")
  async revenue(
    @Param("id") clientId: string,
    @CurrentUser() user: AuthContext,
  ): Promise<GetCrmClientRevenueResponse> {
    return this.analytics.revenue(clientId, user);
  }
}
