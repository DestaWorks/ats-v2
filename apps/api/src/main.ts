import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { logger } from "@destaworks/config/logger";
import { installNodeLogger } from "@destaworks/config/logger/install";
import { installNestRequestContext } from "./common/request-context/nest-request-context";
import { requestContextMiddleware } from "./common/request-context/request-context.middleware";
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
 * It also installs the `RequestContext` adapter, before the server accepts traffic. `packages/auth`
 * reads headers and cookies only through that port, so without it every guarded route answers 500
 * instead of 401 — the port throws rather than falling back to empty headers, which is the right
 * failure but a useless response. The middleware then keeps the request in scope for the whole of
 * its handling, so a service called by a controller resolves the same headers the guard did.
 *
 * Deliberately thin otherwise: hosting concerns — graceful shutdown, connection-pool sizing for a
 * long-lived process — are Phase 4.4.
 */
async function bootstrap(): Promise<void> {
  installNodeLogger();
  installNestRequestContext();
  const app = await NestFactory.create(AppModule);
  app.use(requestContextMiddleware);
  const port = resolvePort();
  await app.listen(port);
  logger.info("api.listening", { port });
}

// No try/catch: if the app cannot start it cannot serve, and Node's own unhandled-rejection exit
// (non-zero status, full stack on stderr) tells an orchestrator more than this file could log —
// the structured logger drops error messages on purpose, because Prisma embeds field values in
// them.
await bootstrap();
