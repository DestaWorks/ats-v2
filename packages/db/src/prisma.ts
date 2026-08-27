import { PrismaClient, type Prisma } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Prisma client singleton (HMR-safe). Connects through the Supabase **transaction
 * pooler** (DATABASE_URL) via the pg driver adapter — this is the only place a
 * PrismaClient is instantiated. Repositories import `prisma` from here; nothing else
 * touches the client directly (enforced by the layered architecture).
 */
const connectionString = process.env.DATABASE_URL;

// `max` caps connections PER serverless instance — unset, node-postgres defaults to 10, and
// Vercel can run many concurrent instances, each opening its own pool against Supabase's
// transaction pooler. 5 is a conservative serverless default (perf audit 2026-08-16); raise it
// only alongside confirming headroom on the pooler's own max-client-connections setting.
// `connectionTimeoutMillis` is the one that matters operationally: without it, a request that
// arrives when the pool is saturated waits forever and burns the whole function duration holding
// nothing. With it, pool exhaustion surfaces as a fast, attributable error instead of a hang.
// `idleTimeoutMillis` is short because a serverless instance is usually idle between invocations
// and should not pin a pooler slot while it is.
function createPrisma(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
  });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Resolve the client to use — the transaction client when a repository method composes an
 * atomic write, else the singleton. Every repository imports this instead of redefining the
 * same one-liner locally.
 */
export function db(tx?: Prisma.TransactionClient) {
  return tx ?? prisma;
}
