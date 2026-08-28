import { Body, Controller, HttpCode, HttpStatus, Inject, Post, UseGuards } from "@nestjs/common";
import { importInputSchema, type ImportReport } from "@destaworks/contracts/validation/migration";
import type { AuthUser } from "@destaworks/auth/guards";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RateLimit } from "../../common/decorators/rate-limit.decorator";
import { RequireCapability } from "../../common/decorators/require-capability.decorator";
import { CapabilityGuard } from "../../common/guards/capability.guard";
import { RateLimitGuard } from "../../common/guards/rate-limit.guard";
import { ZodValidationPipe, type ContractOutput } from "../../common/pipes/zod-validation.pipe";
import type { ServiceOf } from "../service-token";
import { MIGRATION_SERVICE } from "./migration.tokens";

/** Both endpoints take the same body — the staged export — so the pipe is built once. */
const importInputPipe = new ZodValidationPipe(importInputSchema);

/**
 * The one-shot legacy Sheet → Postgres ETL (DECISIONS D1): a dry run that writes nothing, and an
 * idempotent commit keyed on `legacy_id`. Both are `bulkImport`, declared once at the class level.
 *
 * The commit is a long job. On Vercel the Next.js route caps it with `maxDuration = 300` and a
 * large import can still be cut off mid-run; here it is a request on a long-lived Node process,
 * so no platform ceiling applies. That is a property of the host, not a fix — the work still
 * occupies a request thread, and Phase 5's job runner is what actually moves it off the request
 * path. Porting it unchanged is deliberate: the runner is the place to change its shape.
 *
 * `@HttpCode(OK)` on both: Nest answers 201 for a POST by default, and these two return a report
 * rather than creating an addressable resource, so the Next.js routes answer 200. Parity, not taste.
 */
@Controller("migration")
@UseGuards(CapabilityGuard, RateLimitGuard)
@RequireCapability("bulkImport")
export class MigrationController {
  constructor(
    @Inject(MIGRATION_SERVICE) private readonly migration: ServiceOf<typeof MIGRATION_SERVICE>,
  ) {}

  /** POST /migration/prepare — parse, transform and dedupe into a diffable report. Writes nothing. */
  @Post("prepare")
  @HttpCode(HttpStatus.OK)
  prepare(
    @Body(importInputPipe) body: ContractOutput<typeof importInputSchema>,
    @CurrentUser() user: AuthUser,
  ): Promise<ImportReport> {
    return this.migration.prepare(body, user);
  }

  /**
   * POST /migration/commit — the idempotent upsert, plus per-candidate and summary audit.
   * Rate-limited per user because a re-run is a full re-upsert, matching the Next.js route's
   * 10-per-minute bucket.
   */
  @Post("commit")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: "migration-commit", limit: 10, windowMs: 60_000 })
  commit(
    @Body(importInputPipe) body: ContractOutput<typeof importInputSchema>,
    @CurrentUser() user: AuthUser,
  ): Promise<ImportReport> {
    return this.migration.commit(body, user);
  }
}
