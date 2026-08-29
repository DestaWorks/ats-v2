import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { logger } from "@destaworks/config/logger";
import { installNodeLogger } from "@destaworks/config/logger/install";
import { shutdownApplication } from "@destaworks/application/lifecycle";
import { installNestRequestContext } from "./common/request-context/nest-request-context";
import { requestContextMiddleware } from "./common/request-context/request-context.middleware";
import { installJobRuntime } from "./jobs-runtime";
import { AppModule } from "./app.module";

/** Not 3003 — that port belongs to `pnpm dev`, and the two run side by side during the cutover. */
const DEFAULT_PORT = 3004;

/**
 * The browser origins allowed to call this API with credentials.
 *
 * An allowlist, never `origin: true` and never `*`: the session travels in a cookie, so
 * `credentials: true` with a reflected origin lets any site a signed-in user visits read this
 * API as them. `*` is not even legal with credentials, and reflecting is the same hole with
 * extra steps. Unset means no cross-origin caller is allowed at all — the server-rendered read
 * path is server-to-server and needs none of this.
 */
function allowedOrigins(): string[] {
  return (process.env["WEB_ORIGINS"] ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

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
 * Otherwise thin: cross-cutting request handling is Phase 4.2 and lives in `common/`, and TLS
 * terminates at the platform. What does belong here is shutdown, because the entry point is the
 * only thing that knows the process is stopping.
 */
async function bootstrap(): Promise<void> {
  installNodeLogger();

  // The composition root is the only place that names a driver. Everything else — controllers via
  // `JOB_QUEUE`, Next routes via the application-layer port — holds the lazy handle, which is what
  // keeps the pg-boss decision out of every module that merely wants to enqueue.
  const queue = installJobRuntime();
  installNestRequestContext();
  const app = await NestFactory.create(AppModule);
  const origins = allowedOrigins();
  if (origins.length > 0) {
    app.enableCors({ origin: origins, credentials: true });
  }
  app.use(requestContextMiddleware);
  const port = resolvePort();
  await app.listen(port);
  logger.info("api.listening", { port, corsOrigins: origins.length });

  installShutdownHandlers(app, queue);
}

/**
 * Stop cleanly on the signals an orchestrator actually sends. `app.close()` stops accepting new
 * connections and lets in-flight requests finish, so a rolling deploy does not answer a live
 * request with a reset; only once that has drained is it safe to hand back the pooler slots.
 *
 * Guarded against a second signal: an impatient orchestrator sends SIGTERM twice, and re-entering
 * this would close the pool underneath requests that are still draining.
 */
/** Only what shutdown needs from the driver — not the driver's type, which this file should not name twice. */
interface StoppableQueue {
  stop(): Promise<void>;
}

function installShutdownHandlers(app: INestApplication, queue: StoppableQueue): void {
  let stopping = false;

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      if (stopping) return;
      stopping = true;
      logger.info("api.shutting_down", { signal });

      void app
        .close()
        // The queue's pool before the database's, and both only once requests have drained: a
        // request still in flight may enqueue, and an enqueue that travels with its caller's
        // transaction runs on the database connection that transaction holds.
        .then(() => queue.stop())
        .then(() => shutdownApplication())
        .then(() => {
          logger.info("api.stopped", { signal });
          process.exit(0);
        });
    });
  }
}

// No try/catch: if the app cannot start it cannot serve, and Node's own unhandled-rejection exit
// (non-zero status, full stack on stderr) tells an orchestrator more than this file could log —
// the structured logger drops error messages on purpose, because Prisma embeds field values in
// them.
await bootstrap();
