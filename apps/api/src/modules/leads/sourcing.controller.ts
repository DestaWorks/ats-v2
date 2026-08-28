import { Body, Controller, HttpCode, HttpStatus, Inject, Post, UseGuards } from "@nestjs/common";
import {
  findSimilarSchema,
  type PostSourcingSimilarResponse,
} from "@destaworks/contracts/validation/similarity";
import type { AuthUser } from "@destaworks/auth/guards";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { ZodValidationPipe, type ContractOutput } from "../../common/pipes/zod-validation.pipe";
import { SIMILARITY_SERVICE } from "../candidates/candidates.module";
import type { ServiceOf } from "../service-token";

/**
 * Smarter Sourcing's "find providers like this" — ported from
 * `apps/web/src/app/api/sourcing/similar`.
 *
 * It lives in the leads module because it is a sourcing action, but injects the similarity service
 * the candidates module owns: the route area and the service boundary do not have to agree, and
 * duplicating the provider so the folders line up would give the search two homes.
 *
 * `requireUser()` only, matching the route it replaces and Discover beside it — this searches
 * public NPPES data and never our own records, so there is no privilege boundary to gate.
 */
@Controller("sourcing")
@UseGuards(SessionAuthGuard)
export class SourcingController {
  constructor(
    @Inject(SIMILARITY_SERVICE) private readonly similarity: ServiceOf<typeof SIMILARITY_SERVICE>,
  ) {}

  /** POST /sourcing/similar — net-new NPPES providers ranked against the anchor. */
  @Post("similar")
  @HttpCode(HttpStatus.OK)
  async similar(
    @Body(new ZodValidationPipe(findSimilarSchema)) body: ContractOutput<typeof findSimilarSchema>,
    @CurrentUser() user: AuthUser,
  ): Promise<PostSourcingSimilarResponse> {
    return await this.similarity.findSimilar(body, user);
  }
}
