#!/usr/bin/env node
// Locking discipline for migrations authored from here on.
//
// Prisma runs each migration in ONE transaction. Verified against Postgres 16 rather than taken
// from the docs: `SET LOCAL lock_timeout` and `ADD CONSTRAINT ... NOT VALID` both work there;
// `CREATE INDEX CONCURRENTLY` does not ("cannot run inside a transaction block"). So this enforces
// the two that are available, and asks for a written acknowledgement on the one that is not.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const DIR = process.argv[2] ?? "packages/db/prisma/migrations";
// Migrations at or before this are applied somewhere and immutable: Prisma checksums each one, so
// editing a file makes `migrate deploy` fail on drift. These rules govern NEW work only.
const GRANDFATHERED_THROUGH = "20260911100000";

const LOCK_TIMEOUT = /^\s*SET\s+LOCAL\s+lock_timeout\s*=/im;
const TAKES_A_LOCK =
  /^\s*(ALTER\s+TABLE|CREATE\s+INDEX|CREATE\s+UNIQUE\s+INDEX|DROP\s+INDEX|DROP\s+TABLE)/im;
const ADD_CONSTRAINT = /ADD\s+CONSTRAINT\s+\S+\s+(FOREIGN\s+KEY|CHECK)\b/gi;
const SET_NOT_NULL = /ALTER\s+COLUMN\s+\S+\s+SET\s+NOT\s+NULL/i;
const CREATE_INDEX = /^\s*CREATE\s+(UNIQUE\s+)?INDEX\s+(?!CONCURRENTLY)/im;
const LOCK_ACK = /--\s*lock-ack:/i;

/** Statements only — a rule must never fire on the same keyword appearing in prose. */
const stripComments = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");

const failures = [];
const names = existsSync(DIR)
  ? readdirSync(DIR).filter((n) => /^\d{14}_/.test(n) && n.slice(0, 14) > GRANDFATHERED_THROUGH)
  : [];

for (const name of names.sort()) {
  const path = join(DIR, name, "migration.sql");
  if (!existsSync(path)) continue;
  const raw = readFileSync(path, "utf8");
  const sql = stripComments(raw);
  const fail = (rule, fix) => failures.push({ name, rule, fix });

  if (TAKES_A_LOCK.test(sql) && !LOCK_TIMEOUT.test(sql)) {
    fail(
      "takes a table lock with no lock_timeout",
      "put `SET LOCAL lock_timeout = '5s';` first. An ALTER waits behind running readers, and every query arriving after it queues behind THAT — one long SELECT plus one ALTER is a full outage on the table. Failing fast is strictly better than forming the queue",
    );
  }

  for (const match of sql.matchAll(ADD_CONSTRAINT)) {
    const statement = sql.slice(match.index).split(";")[0] ?? "";
    if (!/NOT\s+VALID/i.test(statement)) {
      fail(
        `adds a ${match[1].replace(/\s+/g, " ").toUpperCase()} constraint without NOT VALID`,
        "add `NOT VALID`, then `ALTER TABLE ... VALIDATE CONSTRAINT ...` as a separate statement — validation takes a weaker lock than adding-and-scanning under ACCESS EXCLUSIVE",
      );
    }
  }

  if (SET_NOT_NULL.test(sql)) {
    fail(
      "uses SET NOT NULL, which scans the whole table under an exclusive lock",
      "backfill, add `CHECK (col IS NOT NULL) NOT VALID`, `VALIDATE CONSTRAINT`, then set the column NOT NULL in a later release",
    );
  }

  if (CREATE_INDEX.test(sql) && !LOCK_ACK.test(raw)) {
    fail(
      "builds an index, which blocks writes for the whole build",
      "CONCURRENTLY is impossible under Prisma's migration transaction, so this is a deliberate trade rather than a mistake: add a `-- lock-ack: <why this table is small enough>` comment. Once the legacy import has loaded real rows, that reasoning has to be made again — it is not inheritable",
    );
  }
}

if (failures.length > 0) {
  console.error(`migration safety: FAIL — ${failures.length} issue(s)\n`);
  for (const f of failures) console.error(`  ${f.name}\n    ${f.rule}\n    → ${f.fix}\n`);
  process.exit(1);
}
console.log(
  `migration safety: OK — ${names.length} migration(s) checked (${GRANDFATHERED_THROUGH} and earlier are immutable).`,
);
