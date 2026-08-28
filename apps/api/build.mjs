import { build } from "esbuild";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Bundle the API into a single file so production runs plain `node dist/main.js`.
 *
 * A bundle rather than `tsc` because the workspace packages export TypeScript source directly —
 * `@destaworks/db` resolves to `src/lifecycle.ts`, not a built `.js` — so there is no compiled
 * package graph for Node to resolve at runtime. Bundling follows those source entry points the
 * same way tsx and Next do, and yields one immutable artefact the deploy can hash.
 *
 * Running plain node also fixes a real defect: under `tsx` the runner terminates the process on
 * SIGTERM before the shutdown handler finishes draining, so the API exited 143 with in-flight
 * requests still open. Under node the handler owns the signal.
 *
 * Prisma stays external — it loads its query engine by path at runtime and a bundler cannot
 * relocate that binary correctly.
 */
await build({
  absWorkingDir: dirname(fileURLToPath(import.meta.url)),
  entryPoints: ["src/main.ts"],
  outfile: "dist/main.js",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  // Only the packages that cannot survive bundling are external. Notably NOT `packages:
  // "external"` — that externalises every bare import including `@destaworks/*`, and those
  // resolve to TypeScript source that Node cannot load, so the bundle would die on its first
  // import. Prisma and pg carry native binaries loaded by path at runtime.
  external: [
    "@prisma/client",
    ".prisma/client",
    "@prisma/adapter-pg",
    "pg",
    "pg-native",
    // Nest's optional peers. It `require`s these lazily behind feature checks we never trigger —
    // no microservices, no websockets, and validation is Zod rather than class-validator — so the
    // unresolved require is dead code. Installing them to satisfy the bundler would add three
    // dependencies to ship a path that never runs.
    "@nestjs/microservices",
    "@nestjs/microservices/microservices-module.js",
    "@nestjs/websockets/socket-module.js",
    "class-transformer",
    "class-transformer/storage",
    "class-validator",
    // Pino resolves its transport worker by path relative to the running file, so a bundled copy
    // looks for `dist/lib/worker.js` and dies. Only pretty mode uses a transport, so bundling it
    // would produce an artefact that boots in production and crashes anywhere else — externalising
    // keeps both modes working.
    "pino",
    "pino-pretty",
    // Sentry loads OpenTelemetry instrumentation by module name at runtime.
    "@sentry/node",
  ],
  banner: {
    js: "import{createRequire as __cr}from'module';const require=__cr(import.meta.url);",
  },
});
