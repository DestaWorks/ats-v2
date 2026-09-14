/**
 * What survives bundling — imported by `build.mjs` (to mark them external) and by
 * `scripts/runtime-manifest.mjs` (to install them into the image). One list, two consumers, so a
 * package cannot be external to the bundle and absent from the runtime.
 */

/** Loaded by path at runtime, or carrying a native binary a bundler cannot relocate. */
export const RUNTIME_EXTERNAL = [
  "@prisma/client",
  "@prisma/adapter-pg",
  "pg",
  "pino",
  "@sentry/node",
];

/**
 * Externalised but never installed. Nest `require`s these lazily behind feature checks this app
 * never triggers — no microservices, no websockets, and validation is Zod rather than
 * class-validator — so the require is dead code. `.prisma/client` and `pg-native` are optional
 * resolutions of the packages above; `pino-pretty` is a dev-only transport.
 */
export const UNINSTALLED_EXTERNAL = [
  ".prisma/client",
  "pg-native",
  "pino-pretty",
  "@nestjs/microservices",
  "@nestjs/microservices/microservices-module.js",
  "@nestjs/websockets/socket-module.js",
  "class-transformer",
  "class-transformer/storage",
  "class-validator",
];

export const EXTERNAL = [...RUNTIME_EXTERNAL, ...UNINSTALLED_EXTERNAL];
