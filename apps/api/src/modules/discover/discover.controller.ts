import { Body, Controller, Get, HttpCode, Inject, Post, Query, UseGuards } from "@nestjs/common";
import {
  coverageGapSupplyQuerySchema,
  discoverAddToSourcingSchema,
} from "@destaworks/contracts/validation/discover";
import type {
  GetDiscoverCoverageGapSupplyResponse,
  PostDiscoverAddResponse,
} from "@destaworks/contracts/http/discover";
import type { AuthContext } from "@destaworks/auth/guards";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { ZodValidationPipe, type ContractOutput } from "../../common/pipes/zod-validation.pipe";
import type { ServiceOf } from "../service-token";
import { DISCOVER_SERVICE } from "./discover.tokens";

/**
 * The two Client Discovery reads that cannot be served from the page's own server render: a bulk
 * write into Sourcing, and a lazy NPPES lookup the user triggers per row.
 *
 * Authenticated but ungated, matching the Sourcing writes these feed — an operator who can add a
 * lead by hand can add one from a search result. `source` is fixed to NPPES inside the service, so
 * no request can claim a provenance it did not have.
 */
@Controller("discover")
@UseGuards(SessionAuthGuard)
export class DiscoverController {
  constructor(
    @Inject(DISCOVER_SERVICE)
    private readonly discover: ServiceOf<typeof DISCOVER_SERVICE>,
  ) {}

  @Post("add")
  @HttpCode(200)
  async addToSourcing(
    @Body(new ZodValidationPipe(discoverAddToSourcingSchema))
    body: ContractOutput<typeof discoverAddToSourcingSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<PostDiscoverAddResponse> {
    return this.discover.addToSourcing(body, user);
  }

  @Get("coverage-gaps/supply")
  async coverageGapSupply(
    @Query(new ZodValidationPipe(coverageGapSupplyQuerySchema))
    query: ContractOutput<typeof coverageGapSupplyQuerySchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<GetDiscoverCoverageGapSupplyResponse> {
    return this.discover.supplyForCombo(query, user);
  }
}
