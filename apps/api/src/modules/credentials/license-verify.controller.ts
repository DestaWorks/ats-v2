import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import type { LicenseVerifyDashboardDTO } from "@destaworks/contracts/validation/license-verify";
import type { AuthContext } from "@destaworks/auth/guards";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import type { ServiceOf } from "../service-token";
import { LICENSE_VERIFY_SERVICE } from "./credentials.tokens";

/**
 * License Verify — the verification queue and the expiry timeline behind `/license-verify`.
 *
 * Its own controller rather than a handler on `CredentialsController`, for two reasons that both
 * force it: the path prefix differs, and the gate does. `CredentialsController` gates the whole
 * class on `viewCredentials` because the credentials matrix is a leadership aggregate; this page is
 * open to any signed-in operator by the same reasoning as `verify-license` (D-6) — licence status
 * drives the stage gates, so the Screeners and Associates who hold no capabilities have to see what
 * is blocking the pipeline. Neither list carries a licence number, only its state and status.
 */
@Controller("license-verify")
@UseGuards(SessionAuthGuard)
export class LicenseVerifyController {
  constructor(
    @Inject(LICENSE_VERIFY_SERVICE)
    private readonly licenseVerify: ServiceOf<typeof LICENSE_VERIFY_SERVICE>,
  ) {}

  /** GET /license-verify/dashboard — both lists in one read; no filters, no pagination. */
  @Get("dashboard")
  async dashboard(@CurrentUser() user: AuthContext): Promise<LicenseVerifyDashboardDTO> {
    return this.licenseVerify.dashboard(user);
  }
}
