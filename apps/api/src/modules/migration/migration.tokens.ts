import { migrationService } from "@destaworks/application/migration.service";
import { migrationRunService } from "@destaworks/application/migration-run.service";
import { serviceToken } from "../service-token";

/**
 * The ETL injection token, in its own module.
 *
 * Not in `migration.module.ts`, because the module lists the controller and the controller needs
 * the token: with both in one file the import cycle resolves the token to `undefined` at the
 * moment `@Inject(...)` evaluates, and Nest fails to construct the controller.
 */
export const MIGRATION_SERVICE = serviceToken<typeof migrationService>("MIGRATION_SERVICE");

/** The run lifecycle (Phase 5) — staging a commit and reading its status. Separate from the ETL
 *  itself so a test can fake "queue a run" without faking the import. */
export const MIGRATION_RUN_SERVICE =
  serviceToken<typeof migrationRunService>("MIGRATION_RUN_SERVICE");
