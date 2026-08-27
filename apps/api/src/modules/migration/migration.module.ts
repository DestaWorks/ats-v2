import { Module } from "@nestjs/common";
import { migrationService } from "@destaworks/application/migration.service";
import { provideService, serviceToken } from "../service-token";

export const MIGRATION_SERVICE = serviceToken<typeof migrationService>("MIGRATION_SERVICE");

/**
 * The one-shot legacy Sheet to Postgres ETL (DECISIONS D1): staging an upload, previewing the
 * mapped rows, and committing them.
 *
 * Wiring only until Phase 4.3 adds the controllers: the services are bound to tokens and exported,
 * so a controller injects one instead of importing the singleton and becoming untestable.
 */
@Module({
  providers: [provideService(MIGRATION_SERVICE, migrationService)],
  exports: [MIGRATION_SERVICE],
})
export class MigrationModule {}
