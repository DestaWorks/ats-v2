import { PrismaClient, type Prisma } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Prisma client singleton (HMR-safe). Connects through the Supabase **transaction
 * pooler** (DATABASE_URL) via the pg driver adapter — this is the only place a
 * PrismaClient is instantiated. Repositories import `prisma` from here; nothing else
 * touches the client directly (enforced by the layered architecture).
 */
const connectionString = process.env.DATABASE_URL;

/**
 * Pool settings differ by runtime shape, so they are read from the environment rather than fixed
 * in code. On Vercel the web app runs as many short-lived instances that each open their own pool
 * against Supabase's transaction pooler, so `max` is a per-instance cap and is kept small. The
 * NestJS API is the opposite: one long-lived process where `max` is the whole app's database
 * concurrency and a short idle timeout only churns connections it is about to need again.
 *
 * The defaults below reproduce the serverless numbers exactly (perf audit 2026-08-16), so nothing
 * changes for the web app. Raising `DB_POOL_MAX` for the API requires confirming headroom on the
 * pooler's own max-client-connections setting first — that is a hosting decision, which is why it
 * is a deploy-time variable and not a new literal here.
 *
 * `connectionTimeoutMillis` is the one that matters operationally in both shapes: without it, a
 * request arriving at a saturated pool waits forever, so exhaustion surfaces as a hang instead of
 * a fast, attributable error.
 */
const POOL_DEFAULTS = {
  max: 5,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 10_000,
} as const;

function poolSetting(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function createPrisma(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString,
    max: poolSetting("DB_POOL_MAX", POOL_DEFAULTS.max),
    connectionTimeoutMillis: poolSetting(
      "DB_POOL_CONNECTION_TIMEOUT_MS",
      POOL_DEFAULTS.connectionTimeoutMillis,
    ),
    idleTimeoutMillis: poolSetting("DB_POOL_IDLE_TIMEOUT_MS", POOL_DEFAULTS.idleTimeoutMillis),
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
