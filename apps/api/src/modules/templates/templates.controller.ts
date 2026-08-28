import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import type { TemplatePerformanceDTO } from "@destaworks/contracts/validation/template-performance";
import { RequireCapability } from "../../common/decorators/require-capability.decorator";
import { CapabilityGuard } from "../../common/guards/capability.guard";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import type { ServiceOf } from "../service-token";
import { TEMPLATE_PERFORMANCE_SERVICE } from "./templates.tokens";

/**
 * Outreach templates and how each one is actually performing.
 *
 * Gated on `viewAnalytics` rather than left open as the legacy had it: this is an aggregate
 * analytics view, and the app's convention is that those are leadership reads.
 */
@Controller("templates")
@UseGuards(SessionAuthGuard, CapabilityGuard)
export class TemplatesController {
  constructor(
    @Inject(TEMPLATE_PERFORMANCE_SERVICE)
    private readonly performance: ServiceOf<typeof TEMPLATE_PERFORMANCE_SERVICE>,
  ) {}

  /** GET /templates/performance — usage and response rate per template. No parameters: one snapshot. */
  @Get("performance")
  @RequireCapability("viewAnalytics")
  async overview(): Promise<TemplatePerformanceDTO> {
    return this.performance.overview();
  }
}
