import "dotenv/config";
import { defineConfig, env } from "prisma/config";

/**
 * Prisma 7 config. Migrations run through the Supabase **session pooler** (DIRECT_URL,
 * port 5432 — no pgbouncer) so DDL + shadow-database work. The runtime client connects
 * through the **transaction pooler** (DATABASE_URL) via the pg driver adapter — see
 * `src/server/db/prisma.ts`. (DECISIONS D6: migrations run staging first, then prod.)
 */
export default defineConfig({
  schema: "packages/db/prisma/schema.prisma",
  migrations: { path: "packages/db/prisma/migrations" },
  datasource: { url: env("DIRECT_URL") },
});
