#!/usr/bin/env node
// Raw-SQL index survival check (SAAS-RESTRUCTURE-PLAN 6.2).
//
// Four indexes in this database exist ONLY in hand-written migration SQL, because Prisma's schema
// DSL cannot express them: three GIN trigram indexes and one PARTIAL UNIQUE index over
// `lower(email)`. `prisma migrate dev` diffs the whole schema against the database, sees an index
// schema.prisma does not declare, and proposes DROPPING it as drift. That has already happened
// three times to the trigram indexes — see 20260803194500, 20260807102900 and 20260818120000,
// each of which exists only to put back what the previous migration silently removed.
//
// The partial unique index is the one that matters most and the one with no restore migration
// behind it. `leadService.importLeads()` pre-checks for an existing lead by lowercased email and
// then inserts; without a database-level backstop, two concurrent imports (or an import racing a
// manual add) both pass the pre-check and both insert. It is the ONLY guard against duplicate
// leads, and a duplicate lead is a real person contacted twice by two recruiters.
//
// So this replays every migration in filename order — the order Prisma applies them — and asserts
// each index is live at the end, on the table, over the expression, and with the tenant scoping
// 6.2 gave it. Replaying rather than querying a database is deliberate: the check has to run on a
// pull request, where no database exists, and the regression it catches is committed in SQL long
// before anything is applied.
//
// `pnpm app:raw-index-check`. Proven to fail by deleting the CREATE from the migration that owns
// it and watching the run report the drop.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(repoRoot, "packages", "db", "prisma", "migrations");

/**
 * What must be live after the last migration.
 *
 * `columns` is matched against the index's parenthesised body with whitespace collapsed, so it
 * pins the ORDER of the columns too — a tenant-leading unique index and a tenant-trailing one are
 * different indexes, and only the first can serve a scoped lookup.
 */
const EXPECTED = [
  {
    name: "source_leads_email_lower_unique_idx",
    table: "source_leads",
    unique: true,
    columns: '"tenantId", lower("email")',
    why: "the only guard against two recruiters importing the same lead twice; per-tenant since 6.2",
  },
  {
    name: "candidates_name_trgm_idx",
    table: "candidates",
    unique: false,
    columns: '"name" gin_trgm_ops',
    why: "candidate name search degrades to a sequential scan without it",
  },
  {
    name: "candidates_email_trgm_idx",
    table: "candidates",
    unique: false,
    columns: '"email" gin_trgm_ops',
    why: "candidate email search degrades to a sequential scan without it",
  },
  {
    name: "prospects_practicename_trgm_idx",
    table: "prospects",
    unique: false,
    columns: '"practiceName" gin_trgm_ops',
    why: "practice-name search in Discover degrades to a sequential scan without it",
  },
];

/* --------------------------------------------------------------------- replay ---- */

const CREATE_INDEX =
  /create\s+(unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?"?([A-Za-z0-9_]+)"?\s+on\s+(?:"?[A-Za-z0-9_]+"?\.)?"?([A-Za-z0-9_]+)"?\s*(?:using\s+\w+\s*)?\(/gi;
const DROP_INDEX = /drop\s+index\s+(?:concurrently\s+)?(?:if\s+exists\s+)?"?([A-Za-z0-9_]+)"?/gi;

/** Strip SQL line and block comments, so commented-out SQL never counts as executed. */
function stripSqlComments(sql) {
  return sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * The text between the parenthesis at `open` and its match, whitespace collapsed.
 *
 * Balanced-paren scanning rather than a regex, because `lower("email")` and `("a"), ("b")` both
 * contain parentheses and a non-greedy `\(([^)]*)\)` would stop at the first one.
 */
function parenBody(sql, open) {
  let depth = 0;
  for (let i = open; i < sql.length; i += 1) {
    if (sql[i] === "(") depth += 1;
    else if (sql[i] === ")") {
      depth -= 1;
      if (depth === 0)
        return sql
          .slice(open + 1, i)
          .replace(/\s+/g, " ")
          .trim();
    }
  }
  return null;
}

function migrations() {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => ({
      name,
      sql: stripSqlComments(readFileSync(join(MIGRATIONS_DIR, name, "migration.sql"), "utf8")),
    }));
}

/** Apply every migration in order and report which indexes are live at the end. */
function replay() {
  const live = new Map();
  const droppedBy = new Map();

  for (const { name, sql } of migrations()) {
    // Statement order within one file matters: the contract migration drops an index and
    // recreates it two lines later, and a pass that handled all DROPs first would read that as a
    // deletion. So collect both kinds of event with their offsets and apply them in file order.
    const events = [];
    for (const match of sql.matchAll(DROP_INDEX)) {
      events.push({ at: match.index, kind: "drop", index: match[1] });
    }
    for (const match of sql.matchAll(CREATE_INDEX)) {
      events.push({
        at: match.index,
        kind: "create",
        unique: Boolean(match[1]),
        index: match[2],
        table: match[3],
        columns: parenBody(sql, match.index + match[0].length - 1),
      });
    }
    events.sort((a, b) => a.at - b.at);

    for (const event of events) {
      if (event.kind === "drop") {
        if (live.delete(event.index)) droppedBy.set(event.index, name);
      } else {
        droppedBy.delete(event.index);
        live.set(event.index, {
          table: event.table,
          unique: event.unique,
          columns: event.columns,
          migration: name,
        });
      }
    }
  }

  return { live, droppedBy };
}

/* ---------------------------------------------------------------------- report ---- */

const { live, droppedBy } = replay();
const failures = [];

for (const expected of EXPECTED) {
  const actual = live.get(expected.name);

  if (!actual) {
    const dropped = droppedBy.get(expected.name);
    failures.push(
      dropped
        ? `"${expected.name}" is DROPPED by packages/db/prisma/migrations/${dropped}/migration.sql and never recreated.\n` +
            `      Why it matters: ${expected.why}.\n` +
            `      This index is deliberately absent from schema.prisma, so \`prisma migrate dev\` proposes dropping it as drift.\n` +
            `      Generate schema migrations with \`--create-only\`, delete the unwanted DROP INDEX line, or add a migration that recreates it.`
        : `"${expected.name}" is never created by any migration.\n      Why it matters: ${expected.why}.`,
    );
    continue;
  }

  if (actual.table !== expected.table) {
    failures.push(
      `"${expected.name}" is on "${actual.table}", expected "${expected.table}" (${actual.migration}).`,
    );
  }
  if (actual.unique !== expected.unique) {
    failures.push(
      `"${expected.name}" is ${actual.unique ? "UNIQUE" : "non-unique"}, expected ${
        expected.unique ? "UNIQUE" : "non-unique"
      } (${actual.migration}). ${expected.why}.`,
    );
  }
  if (actual.columns !== expected.columns) {
    failures.push(
      `"${expected.name}" covers (${actual.columns}), expected (${expected.columns}) (${actual.migration}).\n` +
        `      Column ORDER is part of the expectation: a tenant-leading index serves a scoped lookup, a tenant-trailing one does not.`,
    );
  }
}

if (failures.length > 0) {
  console.error("raw-SQL index check: FAILED\n");
  for (const failure of failures) console.error(`  - ${failure}\n`);
  console.error(
    `Checked ${EXPECTED.length} indexes against ${migrations().length} migrations replayed in filename order.`,
  );
  process.exit(1);
}

console.log(
  `raw-SQL index check: OK — ${EXPECTED.length} indexes survive all ${migrations().length} migrations, ` +
    `on the right table, with the right columns in the right order.`,
);
