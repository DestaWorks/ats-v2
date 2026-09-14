import { Body, Controller, Headers, Inject, Post, UseGuards } from "@nestjs/common";
import {
  portalAccessRequestSchema,
  type PostPortalAccessRequestResponse,
} from "@destaworks/contracts/validation/portal";
import { AppError } from "@destaworks/integrations/http/app-error";
import { RateLimit } from "../../common/decorators/rate-limit.decorator";
import { UnattributedMutation } from "../../common/decorators/unattributed-mutation.decorator";
import { RateLimitGuard } from "../../common/guards/rate-limit.guard";
import { ZodValidationPipe, type ContractOutput } from "../../common/pipes/zod-validation.pipe";
import { publicRequestHost, type RequestHeaders } from "../public-request-host";
import type { ServiceOf } from "../service-token";
import { PUBLIC_TENANT_SERVICE } from "../tenants/tenants.tokens";
import { PORTAL_ACCESS_REQUEST_SERVICE } from "./portal.tokens";

/**
 * The REQUESTER side of client-portal access: the public `/portal/request-access` form, ported
 * from the Server Action that used to call the service in-process.
 *
 * It carries no `PortalAuthGuard` and cannot — the caller is asking to become a portal contact and
 * holds no token yet. That makes it the one route under `/portal` without one, and the reason is
 * recorded in `scripts/check-auth-surface.mjs` so the classifier refuses anything else unguarded.
 *
 * The workspace comes from the request host and never from the body; `../public-request-host.ts`
 * carries that decision.
 */
@Controller("portal/access-requests")
export class PortalAccessRequestsController {
  constructor(
    @Inject(PUBLIC_TENANT_SERVICE)
    private readonly tenants: ServiceOf<typeof PUBLIC_TENANT_SERVICE>,
    @Inject(PORTAL_ACCESS_REQUEST_SERVICE)
    private readonly requests: ServiceOf<typeof PORTAL_ACCESS_REQUEST_SERVICE>,
  ) {}

  @Post()
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: "portal-access-request", limit: 20, windowMs: 60_000 })
  @UnattributedMutation({
    reason:
      "Public portal request-access form: the requester is not yet a client contact, so there is " +
      "no principal to attribute the row to. The service writes no audit trail for it.",
  })
  async submit(
    @Headers() headers: RequestHeaders,
    @Body(new ZodValidationPipe(portalAccessRequestSchema))
    body: ContractOutput<typeof portalAccessRequestSchema>,
  ): Promise<PostPortalAccessRequestResponse> {
    const scope = await this.tenants.contextForHost(publicRequestHost(headers));
    if (!scope) throw new AppError("NOT_FOUND", "No such workspace");
    await this.requests.submit(scope, body);
    return { ok: true };
  }
}
