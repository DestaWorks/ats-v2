import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import type { CredentialsOverviewDTO } from "@destaworks/contracts/validation/credentials";
import type { AuthContext } from "@destaworks/auth/guards";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequireCapability } from "../../common/decorators/require-capability.decorator";
import { CapabilityGuard } from "../../common/guards/capability.guard";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import type { ServiceOf } from "../service-token";
import { CREDENTIALS_INTELLIGENCE_SERVICE } from "./credentials.tokens";

/**
 * Credentials Intelligence — the leadership view of licensure across the pipeline.
 *
 * Gated on `viewCredentials` at the route as defence in depth: the page self-gates too, and the
 * capability is the same one that decides whether a candidate's licence number is published at all.
 */
@Controller("credentials")
@UseGuards(SessionAuthGuard, CapabilityGuard)
export class CredentialsController {
  constructor(
    @Inject(CREDENTIALS_INTELLIGENCE_SERVICE)
    private readonly credentials: ServiceOf<typeof CREDENTIALS_INTELLIGENCE_SERVICE>,
  ) {}

  /** GET /credentials/overview — one point-in-time snapshot; no filters, no pagination. */
  @Get("overview")
  @RequireCapability("viewCredentials")
  async overview(@CurrentUser() user: AuthContext): Promise<CredentialsOverviewDTO> {
    return this.credentials.overview(user);
  }
}
