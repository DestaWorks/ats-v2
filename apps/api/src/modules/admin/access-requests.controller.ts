import { Body, Controller, Headers, Inject, Post, UseGuards } from "@nestjs/common";
import {
  submitAccessRequestSchema,
  type PostAccessRequestResponse,
} from "@destaworks/contracts/validation/auth";
import { AppError } from "@destaworks/integrations/http/app-error";
import { RateLimit } from "../../common/decorators/rate-limit.decorator";
import { UnattributedMutation } from "../../common/decorators/unattributed-mutation.decorator";
import { RateLimitGuard } from "../../common/guards/rate-limit.guard";
import { ZodValidationPipe, type ContractOutput } from "../../common/pipes/zod-validation.pipe";
import { publicRequestHost, type RequestHeaders } from "../public-request-host";
import type { ServiceOf } from "../service-token";
import { PUBLIC_TENANT_SERVICE } from "../tenants/tenants.tokens";
import { ACCESS_REQUEST_SERVICE } from "./admin.tokens";

/**
 * The APPLICANT side of operator access: the public `/request-access` form, ported from the Server
 * Action that used to call the service in-process.
 *
 * PUBLIC by necessity — the person filing one has no account yet — so it carries no auth guard and
 * its only defence is the rate limiter, which runs before the body is even parsed. Its sibling
 * `AdminAccessRequestsController` is the queue an operator works through.
 *
 * The workspace comes from the request host and never from the body; `../public-request-host.ts`
 * carries that decision.
 */
@Controller("access-requests")
export class AccessRequestsController {
  constructor(
    @Inject(PUBLIC_TENANT_SERVICE)
    private readonly tenants: ServiceOf<typeof PUBLIC_TENANT_SERVICE>,
    @Inject(ACCESS_REQUEST_SERVICE)
    private readonly requests: ServiceOf<typeof ACCESS_REQUEST_SERVICE>,
  ) {}

  @Post()
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: "access-request", limit: 20, windowMs: 60_000 })
  @UnattributedMutation({
    reason:
      "Public request-access form: the applicant has no account yet, so there is no operator to " +
      "attribute the row to. The service writes no audit trail for it.",
  })
  async submit(
    @Headers() headers: RequestHeaders,
    @Body(new ZodValidationPipe(submitAccessRequestSchema))
    body: ContractOutput<typeof submitAccessRequestSchema>,
  ): Promise<PostAccessRequestResponse> {
    const scope = await this.tenants.contextForHost(publicRequestHost(headers));
    if (!scope) throw new AppError("NOT_FOUND", "No such workspace");
    await this.requests.submit(scope, body);
    return { ok: true };
  }
}
