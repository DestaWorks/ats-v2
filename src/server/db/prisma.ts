import "server-only";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Prisma client singleton (HMR-safe). Connects through the Supabase **transaction
 * pooler** (DATABASE_URL) via the pg driver adapter — this is the only place a
 * PrismaClient is instantiated. Repositories import `prisma` from here; nothing else
 * touches the client directly (enforced by the layered architecture).
 */
const connectionString = process.env.DATABASE_URL;

function createPrisma(): PrismaClient {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
