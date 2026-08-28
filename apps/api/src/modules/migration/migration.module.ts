import { Module } from "@nestjs/common";
import { migrationService } from "@destaworks/application/migration.service";
import { provideService } from "../service-token";
import { MigrationController } from "./migration.controller";
import { MIGRATION_SERVICE } from "./migration.tokens";

/**
 * The one-shot legacy Sheet to Postgres ETL (DECISIONS D1): staging an upload, previewing the
 * mapped rows, and committing them.
 *
 * The service is bound to a token (`migration.tokens.ts`) rather than imported by the controller,
 * so `MigrationController` injects it instead of reaching for the singleton and becoming
 * untestable.
 */
@Module({
  controllers: [MigrationController],
  providers: [provideService(MIGRATION_SERVICE, migrationService)],
  exports: [MIGRATION_SERVICE],
})
export class MigrationModule {}
