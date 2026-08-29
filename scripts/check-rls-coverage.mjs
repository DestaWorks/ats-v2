#!/usr/bin/env node
/**
 * Tenant-scoping coverage gate (SAAS-RESTRUCTURE-PLAN 6.6/6.7).
 *
 * The isolation suite proves that RLS works on the tables it knows about. This proves it knows
 * about all of them — and needs no database to do it, so it runs in the fast static job on every
 * PR rather than only in the job with a Postgres container.
 *
 * It fails when:
 *   1. `schema.prisma` and `packages/db/src/tenant-models.ts` disagree about which models are
 *      tenant-scoped, or about the table a model maps to. This is the drift that would otherwise
 *      leave a new model out of RLS and out of the isolation suite at the same time — both lists
 *      being derived from the same file is what makes that impossible.
 *   2. A tenant-scoped table is missing `ENABLE`, `FORCE` or the `tenant_isolation` policy in the
 *      RLS migration.
 *   3. A GLOBAL model has acquired a `tenantId`, or a tenant-scoped one has lost it.
 *   4. The number of un-scoped object-storage keys has grown. Same ratchet as `dbUnscoped`: the
 *      two remaining sites are known and shrinking, and a third must be a deliberate act.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SCHEMA = "packages/db/prisma/schema.prisma";
const MODELS = "packages/db/src/tenant-models.ts";
const MIGRATIONS_DIR = "packages/db/prisma/migrations";
const RLS_MIGRATION = "20260830120000_enable_tenant_row_level_security";
const PENDING_EXPAND = "packages/db/isolation/pending-6.1-expand.sql";

/** Un-scoped storage keys still permitted, and the sites that hold them. Only ever goes down. */
const UNSCOPED_STORAGE_KEY_BUDGET = 2;

/**
 * The one model that names a tenant and is still global, with the reason.
 *
 * `Membership` IS the tenant boundary rather than a thing inside it. Scoping it to the active
 * tenant would make "which tenants may this user switch to" unanswerable, and an RLS policy on it
 * would break sign-in for anyone with more than one membership. Its authorization is that a query
 * always filters by `userId`, which the session establishes.
 */
const GLOBAL_MODELS_WITH_A_TENANT_ID = new Set(["Membership"]);

const failures = [];
function fail(rule, message) {
  failures.push({ rule, message });
}

// ---------------------------------------------------------------------------------------------
// 1. What the schema says.
// ---------------------------------------------------------------------------------------------
const schema = readFileSync(SCHEMA, "utf8");
const schemaModels = new Map();
for (const [, name, body] of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
  const mapped = body.match(/@@map\("([^"]+)"\)/);
  schemaModels.set(name, {
    table: mapped ? mapped[1] : name,
    hasTenantId: /^\s*tenantId\s+String/m.test(body),
  });
}

// ---------------------------------------------------------------------------------------------
// 2. What the canonical list says.
// ---------------------------------------------------------------------------------------------
const modelsSource = readFileSync(MODELS, "utf8");
const listed = new Map(
  [...modelsSource.matchAll(/\{\s*model:\s*"(\w+)",\s*table:\s*"(\w+)"\s*\}/g)].map((m) => [
    m[1],
    m[2],
  ]),
);
const globalBlock = modelsSource.match(/GLOBAL_MODELS[\s\S]*?new Set\(\[([\s\S]*?)\]\)/);
const globalListed = new Set(
  globalBlock ? [...globalBlock[1].matchAll(/"(\w+)"/g)].map((m) => m[1]) : [],
);
if (globalListed.size === 0) {
  fail("models-match-schema", `Could not parse GLOBAL_MODELS out of ${MODELS}.`);
}

/** A model is tenant-scoped when it names a tenant AND is not on the global allowlist. */
const schemaScoped = new Map(
  [...schemaModels]
    .filter(([name, m]) => m.hasTenantId && !globalListed.has(name))
    .map(([name, m]) => [name, m.table]),
);

for (const [model, table] of schemaScoped) {
  if (!listed.has(model)) {
    fail(
      "models-match-schema",
      `${model} carries tenantId in the schema but is missing from TENANT_SCOPED_MODELS — it would ` +
        `have no RLS policy and no isolation test.`,
    );
  } else if (listed.get(model) !== table) {
    fail(
      "models-match-schema",
      `${model} maps to "${table}" in the schema but "${listed.get(model)}" in TENANT_SCOPED_MODELS.`,
    );
  }
}
for (const model of listed.keys()) {
  if (!schemaScoped.has(model)) {
    fail(
      "models-match-schema",
      `${model} is in TENANT_SCOPED_MODELS but is not a tenant-scoped model in the schema.`,
    );
  }
}
for (const model of globalListed) {
  const declared = schemaModels.get(model);
  if (declared === undefined) {
    fail("global-models-have-no-tenant", `${model} is listed as GLOBAL but no such model exists.`);
    continue;
  }
  if (declared.hasTenantId && !GLOBAL_MODELS_WITH_A_TENANT_ID.has(model)) {
    fail(
      "global-models-have-no-tenant",
      `${model} is listed as GLOBAL but has a tenantId. Either it belongs to a tenant — in which ` +
        `case remove it from GLOBAL_MODELS so the seam scopes it and RLS protects it — or the ` +
        `column is wrong. Only the boundary itself gets an exception, and it is written down.`,
    );
  }
}
for (const [model, declared] of schemaModels) {
  if (!declared.hasTenantId && !globalListed.has(model)) {
    fail(
      "global-models-have-no-tenant",
      `${model} has no tenantId and is not in GLOBAL_MODELS. Add it there if it is genuinely ` +
        `platform-wide, or give it a tenant.`,
    );
  }
}

// ---------------------------------------------------------------------------------------------
// 3. Every tenant-scoped table is protected by the migration.
// ---------------------------------------------------------------------------------------------
const migrationNames = readdirSync(MIGRATIONS_DIR).filter((n) =>
  statSync(join(MIGRATIONS_DIR, n)).isDirectory(),
);
if (!migrationNames.includes(RLS_MIGRATION)) {
  fail("rls-migration-exists", `${RLS_MIGRATION} is missing — nothing enables RLS.`);
} else {
  const sql = readFileSync(join(MIGRATIONS_DIR, RLS_MIGRATION, "migration.sql"), "utf8");
  for (const table of new Set(schemaScoped.values())) {
    if (!sql.includes(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`)) {
      fail("rls-covers-every-table", `${table} never gets ENABLE ROW LEVEL SECURITY.`);
    }
    if (!sql.includes(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY;`)) {
      fail(
        "rls-covers-every-table",
        `${table} is not FORCEd, so the role that owns it — which is the role the app connects ` +
          `as — is exempt from its own policy.`,
      );
    }
    if (!sql.includes(`CREATE POLICY "tenant_isolation" ON "${table}"`)) {
      fail("rls-covers-every-table", `${table} has RLS on but no tenant_isolation policy.`);
    }
  }
  // A later migration must not quietly undo this one.
  for (const name of migrationNames.filter((n) => n > RLS_MIGRATION)) {
    const later = readFileSync(join(MIGRATIONS_DIR, name, "migration.sql"), "utf8");
    if (/NO FORCE ROW LEVEL SECURITY|DISABLE ROW LEVEL SECURITY/.test(later)) {
      fail(
        "rls-not-undone",
        `${name} disables or un-forces row-level security. If that is deliberate, it needs its own ` +
          `review; it must not arrive as a side effect.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------------------------
// 4. The 6.1 bridge deletes itself.
// ---------------------------------------------------------------------------------------------
// `packages/db/isolation/pending-6.1-expand.sql` exists only while the migrations workstream has
// not shipped the expand migration. Once one does, the bridge is a second, divergent definition of
// the same tables — so the merge that brings the real migration is forced to delete it.
const expandMigrationExists = migrationNames.some((name) =>
  /CREATE TABLE "tenants"/.test(readFileSync(join(MIGRATIONS_DIR, name, "migration.sql"), "utf8")),
);
let bridgeExists = true;
try {
  statSync(PENDING_EXPAND);
} catch {
  bridgeExists = false;
}
if (expandMigrationExists && bridgeExists) {
  fail(
    "bridge-is-temporary",
    `A migration now creates "tenants", so ${PENDING_EXPAND} is a second definition of the same ` +
      `tables. Delete it, and remove the branch that applies it in scripts/apply-migrations.mjs.`,
  );
}
if (!expandMigrationExists && !bridgeExists) {
  fail(
    "bridge-is-temporary",
    `Nothing creates the tenant tables: no migration does, and ${PENDING_EXPAND} is gone. The ` +
      `isolation suite cannot build a schema to test.`,
  );
}

// ---------------------------------------------------------------------------------------------
// 5. The un-scoped storage-key ratchet.
// ---------------------------------------------------------------------------------------------
function sourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== "generated") sourceFiles(path, out);
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      out.push(path);
    }
  }
  return out;
}

let unscopedKeys = 0;
for (const file of [...sourceFiles("packages"), ...sourceFiles("apps")]) {
  if (file.endsWith("storage.ts") || file.includes(".test.")) continue;
  const uses = readFileSync(file, "utf8").match(/unscopedStorageKey\(/g);
  if (uses) unscopedKeys += uses.length;
}
if (unscopedKeys > UNSCOPED_STORAGE_KEY_BUDGET) {
  fail(
    "storage-keys-carry-their-owner",
    `${unscopedKeys} object-storage keys are built without an owner (budget ${UNSCOPED_STORAGE_KEY_BUDGET}). ` +
      `A key with no tenant in it is a leak waiting for an id collision — use tenantStorageKey or ` +
      `userStorageKey.`,
  );
}

// ---------------------------------------------------------------------------------------------
if (failures.length > 0) {
  console.error("RLS coverage check FAILED:\n");
  for (const { rule, message } of failures) console.error(`  [${rule}] ${message}`);
  console.error("");
  process.exit(1);
}

console.log(
  `RLS coverage: OK — ${schemaScoped.size} tenant-scoped tables enabled, forced and policied; ` +
    `${globalListed.size} global models carry no tenant; ` +
    `${unscopedKeys}/${UNSCOPED_STORAGE_KEY_BUDGET} un-scoped storage keys remain.`,
);
