import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  portalLogViewSchema,
  type GetPortalDataResponse,
  type PostPortalLogViewResponse,
} from "@destaworks/contracts/validation/portal";
import type { PortalContext } from "@destaworks/auth/portal-guards";
import { CurrentPortalContact } from "../../common/decorators/current-portal-contact.decorator";
import { PortalAuthGuard } from "../../common/guards/portal-auth.guard";
import { ZodValidationPipe, type ContractOutput } from "../../common/pipes/zod-validation.pipe";
import { CLIENT_PORTAL_SERVICE } from "./portal.tokens";
import type { ServiceOf } from "../service-token";

/**
 * The client portal's own reads, ported from the in-process calls in `apps/web/src/app/portal`.
 *
 * Guarded exactly like `PortalRolesController`, and for the same reason: the caller is an external
 * client contact, not one of the six internal roles, so `PortalAuthGuard` alone — never
 * `SessionAuthGuard`, never a capability. Identity is whatever the `portal_token` COOKIE resolved
 * to and nothing else; no body, query or header value reaches `clientId`, which is the legacy
 * `portal_data` IDOR closed.
 */
@Controller("portal")
@UseGuards(PortalAuthGuard)
export class PortalDataController {
  constructor(
    @Inject(CLIENT_PORTAL_SERVICE) private readonly portal: ServiceOf<typeof CLIENT_PORTAL_SERVICE>,
  ) {}

  /**
   * GET /portal/data — the contact's client, their visible candidates and their open roles.
   *
   * The request carries no parameters at all: there is nothing for a caller to name, so there is
   * nothing for it to change. The response is `PortalDataDTO` unchanged — an allow-list projection
   * this controller must not widen.
   */
  @Get("data")
  async data(@CurrentPortalContact() contact: PortalContext): Promise<GetPortalDataResponse> {
    return await this.portal.data(contact);
  }

  /** POST /portal/log-view — record that the contact viewed a portal page. 200, acknowledgement only. */
  @Post("log-view")
  @HttpCode(HttpStatus.OK)
  async logView(
    @Body(new ZodValidationPipe(portalLogViewSchema))
    body: ContractOutput<typeof portalLogViewSchema>,
    @CurrentPortalContact() contact: PortalContext,
  ): Promise<PostPortalLogViewResponse> {
    await this.portal.logView(contact, body.page);
    return { ok: true };
  }
}
