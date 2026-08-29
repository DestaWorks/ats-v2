import { Body, Controller, Get, HttpCode, Inject, Post, Query, UseGuards } from "@nestjs/common";
import {
  coverageGapSupplyQuerySchema,
  discoverAddToSourcingSchema,
  discoverSearchQuerySchema,
} from "@destaworks/contracts/validation/discover";
import type {
  GetDiscoverCoverageGapsResponse,
  GetDiscoverCoverageGapSupplyResponse,
  GetDiscoverSearchResponse,
  PostDiscoverAddResponse,
} from "@destaworks/contracts/http/discover";
import type { AuthContext } from "@destaworks/auth/guards";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { ZodValidationPipe, type ContractOutput } from "../../common/pipes/zod-validation.pipe";
import { flatQuery } from "../../common/query-params";
import type { ServiceOf } from "../service-token";
import { DISCOVER_SERVICE } from "./discover.tokens";

/**
 * Discover (NPPES) over HTTP: the registry search and the coverage-gap widget the `/discover` page
 * renders, plus the bulk write into Sourcing and the lazy per-row supply lookup.
 *
 * Authenticated but ungated, matching the Sourcing writes these feed — an operator who can add a
 * lead by hand can add one from a search result. `source` is fixed to NPPES inside the service, so
 * no request can claim a provenance it did not have. `viewClientDiscovery` gates the B2B prospect
 * pipeline (`SavedIcpsController`), not this one, and attaching it here would be a widening.
 */
@Controller("discover")
@UseGuards(SessionAuthGuard)
export class DiscoverController {
  constructor(
    @Inject(DISCOVER_SERVICE)
    private readonly discover: ServiceOf<typeof DISCOVER_SERVICE>,
  ) {}

  /**
   * GET /discover/search — the registry search the `/discover` page renders its results table from.
   *
   * Declared before `coverage-gaps/*` only for readability; the segments do not overlap. The
   * contract's own `.refine` rejects a query with nothing but a state, which is what NPPES itself
   * refuses — so an empty filter bar is a 422 here rather than an upstream error, and the page
   * asks for this endpoint only once it has something to search on.
   */
  @Get("search")
  async search(
    @Query(flatQuery, new ZodValidationPipe(discoverSearchQuerySchema))
    query: ContractOutput<typeof discoverSearchQuerySchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<GetDiscoverSearchResponse> {
    return this.discover.search(query, user);
  }

  /** GET /discover/coverage-gaps — open-role demand vs. sourced/pipeline supply, counts only. */
  @Get("coverage-gaps")
  async coverageGaps(@CurrentUser() user: AuthContext): Promise<GetDiscoverCoverageGapsResponse> {
    return this.discover.coverageGaps(user);
  }

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
