#!/usr/bin/env node
/**
 * Build the schema in a THROWAWAY database by replaying `prisma/migrations/*​/migration.sql` in
 * order, so the isolation suite has something real to run against.
 *
 * WHY NOT `prisma migrate deploy`
 *
 * Because the difference between "the throwaway database" and "the live one with real PII" would
 * then be one environment variable. This script refuses to run against anything that does not
 * look disposable (see `assertDisposable`), which `prisma migrate deploy` cannot be taught to do.
 * The migration files are plain SQL and Postgres parses them the same either way, so nothing is
 * lost — including the `$$ … $$` block in the RLS migration, which the simple query protocol
 * handles unchanged.
 *
 * It writes `_prisma_migrations` rows for what it applied, so a database built this way is not
 * mistaken for one that drifted.
 *
 * Usage: ISOLATION_DATABASE_URL=postgres://… node scripts/apply-migrations.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { ensureAppRole } from "./isolation-role.mjs";

const MIGRATIONS_DIR = "packages/db/prisma/migrations";

/**
 * Refuse anything that could be somebody's real database.
 *
 * The check is on the host, not on a flag a caller could pass by accident: the only databases this
 * script will touch are on a loopback address. A hosted Postgres — Supabase, RDS, anything with a
 * real hostname — is rejected before a connection is opened.
 */
function assertDisposable(url) {
  const parsed = new URL(url);
  const local = ["localhost", "127.0.0.1", "::1", "0.0.0.0"];
  if (!local.includes(parsed.hostname)) {
    throw new Error(
      `Refusing to apply migrations to "${parsed.hostname}". This script only builds throwaway ` +
        `databases on a loopback address; a hosted database is migrated by the deploy pipeline.`,
    );
  }
}

function migrationDirectories() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => statSync(join(MIGRATIONS_DIR, name)).isDirectory())
    .sort();
}

const url = process.env.ISOLATION_DATABASE_URL;
if (!url) {
  console.error("ISOLATION_DATABASE_URL is not set.");
  process.exit(1);
}
try {
  assertDisposable(url);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    id                      VARCHAR(36) PRIMARY KEY,
    checksum                VARCHAR(64) NOT NULL,
    finished_at             TIMESTAMPTZ,
    migration_name          VARCHAR(255) NOT NULL,
    logs                    TEXT,
    rolled_back_at          TIMESTAMPTZ,
    started_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    applied_steps_count     INTEGER NOT NULL DEFAULT 0
  )
`);

const applied = new Set(
  (await client.query(`SELECT migration_name FROM "_prisma_migrations"`)).rows.map(
    (r) => r.migration_name,
  ),
);

/**
 * The 6.1 expand DDL, while the migrations workstream has not shipped it yet.
 *
 * Applied only when no migration creates `tenants` — the day one does, this is skipped and
 * `check-rls-coverage.mjs` starts failing until the file is deleted. See the file's own header.
 */
let count = 0;
for (const name of migrationDirectories()) {
  if (applied.has(name)) continue;
  const sql = readFileSync(join(MIGRATIONS_DIR, name, "migration.sql"), "utf8");
  try {
    await client.query(sql);
  } catch (error) {
    console.error(`\nFailed applying ${name}:\n${error.message}\n`);
    await client.end();
    process.exit(1);
  }
  await client.query(
    `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count)
     VALUES ($1, $2, now(), $3, 1)`,
    [randomUUID(), createHash("sha256").update(sql).digest("hex"), name],
  );
  count += 1;
}

// Hand the schema to the unprivileged role the suite connects as. Without this the suite runs as
// a superuser, which no policy applies to — see `isolation-role.mjs`.
await ensureAppRole(client);

await client.end();
console.log(`applied ${count} migration(s) to ${new URL(url).pathname.slice(1)}`);
