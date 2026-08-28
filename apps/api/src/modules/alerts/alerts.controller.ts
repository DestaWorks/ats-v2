import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import type { AlertsDTO } from "@destaworks/contracts/validation/alerts";
import type { AuthUser } from "@destaworks/auth/guards";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import type { ServiceOf } from "../service-token";
import { ALERT_SERVICE } from "./alerts.tokens";

/**
 * The alerts bell. One composite read — mentions, the unread badge count, and the three derived
 * buckets (overdue / new-to-review / verification-pending) — scoped to the SESSION user by the
 * service, never by a parameter the caller supplies. Signed in is the only requirement; what a
 * viewer may see inside it is the service's decision.
 */
@Controller("alerts")
@UseGuards(SessionAuthGuard)
export class AlertsController {
  constructor(@Inject(ALERT_SERVICE) private readonly alerts: ServiceOf<typeof ALERT_SERVICE>) {}

  @Get()
  async forViewer(@CurrentUser() user: AuthUser): Promise<AlertsDTO> {
    return await this.alerts.forViewer(user);
  }
}
