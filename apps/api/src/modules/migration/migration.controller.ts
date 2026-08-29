import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  importInputSchema,
  type ImportReport,
  type MigrationCommitAccepted,
  type MigrationRunState,
} from "@destaworks/contracts/validation/migration";
import type { AuthContext } from "@destaworks/auth/guards";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RateLimit } from "../../common/decorators/rate-limit.decorator";
import { RequireCapability } from "../../common/decorators/require-capability.decorator";
import { CapabilityGuard } from "../../common/guards/capability.guard";
import { RateLimitGuard } from "../../common/guards/rate-limit.guard";
import { ZodValidationPipe, type ContractOutput } from "../../common/pipes/zod-validation.pipe";
import type { ServiceOf } from "../service-token";
import { MIGRATION_RUN_SERVICE, MIGRATION_SERVICE } from "./migration.tokens";

/** Both endpoints take the same body — the staged export — so the pipe is built once. */
const importInputPipe = new ZodValidationPipe(importInputSchema);

/**
 * The one-shot legacy Sheet → Postgres ETL (DECISIONS D1): a dry run that writes nothing, and an
 * idempotent commit keyed on `legacy_id`. Both are `bulkImport`, declared once at the class level.
 *
 * Phase 5 moved the commit off the request path entirely. It no longer returns a report from
 * either stack: it stages the upload, queues a `migration.commit` job, and answers `202` with a
 * run id that `GET /migration/runs/:runId` reads back. The earlier note here — that this host has
 * no `maxDuration` ceiling so the work "fits" — was a property of the host, not a fix; the work
 * still held a request thread for minutes with no record of where it got to if it died.
 *
 * `@HttpCode` is explicit on every route: Nest answers 201 for a POST by default, and none of
 * these create an addressable resource at the posted path. Parity with the Next.js routes — 200
 * for the dry run, 202 for accepted work — not taste.
 */
@Controller("migration")
@UseGuards(CapabilityGuard, RateLimitGuard)
@RequireCapability("bulkImport")
export class MigrationController {
  constructor(
    @Inject(MIGRATION_SERVICE) private readonly migration: ServiceOf<typeof MIGRATION_SERVICE>,
    @Inject(MIGRATION_RUN_SERVICE)
    private readonly runs: ServiceOf<typeof MIGRATION_RUN_SERVICE>,
  ) {}

  /** POST /migration/prepare — parse, transform and dedupe into a diffable report. Writes nothing. */
  @Post("prepare")
  @HttpCode(HttpStatus.OK)
  prepare(
    @Body(importInputPipe) body: ContractOutput<typeof importInputSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<ImportReport> {
    return this.migration.prepare(body, user);
  }

  /**
   * POST /migration/commit — stage the export and queue the import. Rate-limited per user on the
   * same 10-per-minute bucket as the Next.js route: it now meters how often an import can be
   * QUEUED, which is the cost that matters once the caller no longer waits for it.
   */
  @Post("commit")
  @HttpCode(HttpStatus.ACCEPTED)
  @RateLimit({ name: "migration-commit", limit: 10, windowMs: 60_000 })
  commit(
    @Body(importInputPipe) body: ContractOutput<typeof importInputSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<MigrationCommitAccepted> {
    return this.runs.start(body, user);
  }

  /**
   * GET /migration/runs/:runId — did it finish, and if not, where did it stop. Same `bulkImport`
   * gate as starting one: the run's report names the candidates it imported.
   */
  @Get("runs/:runId")
  @HttpCode(HttpStatus.OK)
  run(@Param("runId") runId: string, @CurrentUser() user: AuthContext): Promise<MigrationRunState> {
    return this.runs.state(runId, user);
  }
}
