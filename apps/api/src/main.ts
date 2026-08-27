import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { logger } from "@destaworks/config/logger";
import { installNodeLogger } from "@destaworks/config/logger/install";
import { AppModule } from "./app.module";

/** Not 3003 — that port belongs to `pnpm dev`, and the two run side by side during the cutover. */
const DEFAULT_PORT = 3004;

function resolvePort(): number {
  const configured = process.env["API_PORT"] ?? process.env["PORT"];
  const parsed = Number.parseInt(configured ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
}

/**
 * The API's entry point. It installs the shared structured logger before anything else so a boot
 * line is redacted and correlated the same way a request line is, then hands off to Nest.
 *
 * Deliberately thin: hosting concerns — TLS, graceful shutdown, connection-pool sizing for a
 * long-lived process — are Phase 4.4, and cross-cutting request handling is Phase 4.2. Adding
 * either here now would put them somewhere they have to be moved out of.
 */
async function bootstrap(): Promise<void> {
  installNodeLogger();
  const app = await NestFactory.create(AppModule);
  const port = resolvePort();
  await app.listen(port);
  logger.info("api.listening", { port });
}

// No try/catch: if the app cannot start it cannot serve, and Node's own unhandled-rejection exit
// (non-zero status, full stack on stderr) tells an orchestrator more than this file could log —
// the structured logger drops error messages on purpose, because Prisma embeds field values in
// them.
await bootstrap();
