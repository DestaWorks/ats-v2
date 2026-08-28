import { prisma } from "./prisma";

/**
 * Close the pool. A serverless instance is frozen rather than stopped, so nothing called this
 * before; a long-lived API process is the opposite and must hand its pooler slots back on SIGTERM
 * instead of letting them expire. Safe to call twice — Prisma's `$disconnect` is idempotent.
 *
 * Deliberately not exported from `./prisma`: that module is restricted to the repository layer
 * because importing it anywhere else means querying from the wrong layer. Shutting the pool down
 * is a lifecycle concern, not a query, so it gets an entry point that says so — which is what
 * lets the application layer own shutdown without the restriction being loosened for everyone.
 */
export async function closeDatabase(): Promise<void> {
  await prisma.$disconnect();
}
