import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import type { LookupOptionsDTO } from "@destaworks/contracts/validation/lookups";
import type { AuthContext } from "@destaworks/auth/guards";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import type { ServiceOf } from "../service-token";
import { LOOKUP_SERVICE } from "./lookups.tokens";

/**
 * The id + name pairs every filter dropdown needs, in one call.
 *
 * Session-gated and no capability: a select that asks "which client?" or "assign to whom?" needs a
 * label, not the record behind it. The full shapes stay where they are — `GET /crm/clients` behind
 * `viewCrm`, `GET /tenants/members` behind `manageUsers` — so serving a dropdown never widens a
 * gate. One endpoint rather than two because nine pages need both together, and 4.0's paydown list
 * is explicit that a composite read becomes a composite endpoint, not N round trips.
 */
@Controller("lookups")
@UseGuards(SessionAuthGuard)
export class LookupsController {
  constructor(@Inject(LOOKUP_SERVICE) private readonly lookups: ServiceOf<typeof LOOKUP_SERVICE>) {}

  /** GET /lookups — filter options for the active workspace. */
  @Get()
  async filterOptions(@CurrentUser() user: AuthContext): Promise<LookupOptionsDTO> {
    return this.lookups.filterOptions(user);
  }
}
