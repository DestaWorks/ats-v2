import { closeDatabase } from "@destaworks/db/lifecycle";

/**
 * Release the process-wide resources the application layer owns, in the order a shutdown needs
 * them released: connections last, after in-flight work that might still use them has drained.
 *
 * This exists so `apps/api` can shut down cleanly without importing `@destaworks/db` — the
 * dependency law forbids that edge, and it is the same law that keeps the API free of Prisma
 * types. The API owns *when* to shut down; the application layer owns *what* that entails.
 */
export async function shutdownApplication(): Promise<void> {
  await closeDatabase();
}
