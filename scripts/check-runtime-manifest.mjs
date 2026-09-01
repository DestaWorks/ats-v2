/**
 * The API and migrator images install their dependencies with `npm ci` from committed manifests
 * under `apps/api/runtime{,-migrate}` — the bundle's externals are installed there rather than
 * linked from the workspace, so `pnpm-lock.yaml` does not cover them.
 *
 * A second lockfile is a second source of truth, and an unchecked one WILL drift. This is the
 * check that stops it: every pinned version must equal what pnpm resolved. It also refuses a
 * manifest whose dependency SET no longer matches `apps/api/externals.mjs`, so a package cannot
 * become external to the bundle and stay absent from the image.
 *
 * Run `pnpm runtime:manifest` to regenerate, then `npm install --package-lock-only` in each
 * directory. Both are deliberate, reviewable diffs.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RUNTIME_EXTERNAL } from "../apps/api/externals.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const MIGRATE_ONLY = ["prisma", "dotenv"];

const SEARCH = ["packages/db", "apps/api", "packages/config", "packages/integrations", "."].map(
  (p) => join(repoRoot, p, "node_modules"),
);

function installedVersion(name) {
  for (const base of SEARCH) {
    const manifest = join(base, name, "package.json");
    if (existsSync(manifest)) return JSON.parse(readFileSync(manifest, "utf8")).version;
  }
  return undefined;
}

const failures = [];

for (const [dir, expected] of [
  ["apps/api/runtime", RUNTIME_EXTERNAL],
  ["apps/api/runtime-migrate", MIGRATE_ONLY],
]) {
  const manifestPath = join(repoRoot, dir, "package.json");
  const lockPath = join(repoRoot, dir, "package-lock.json");

  if (!existsSync(manifestPath)) {
    failures.push(`${dir}/package.json is missing — run \`pnpm runtime:manifest\``);
    continue;
  }
  if (!existsSync(lockPath)) {
    failures.push(
      `${dir}/package-lock.json is missing — the image would install unpinned transitives`,
    );
  }

  const declared = JSON.parse(readFileSync(manifestPath, "utf8")).dependencies ?? {};

  for (const name of expected) {
    if (!(name in declared)) {
      failures.push(`${dir} does not declare "${name}", which the bundle leaves external`);
    }
  }
  for (const name of Object.keys(declared)) {
    if (!expected.includes(name)) {
      failures.push(`${dir} declares "${name}", which is not in the expected set`);
    }
  }
  for (const [name, pinned] of Object.entries(declared)) {
    const actual = installedVersion(name);
    if (actual === undefined) {
      failures.push(`${dir} pins "${name}@${pinned}" but it resolves nowhere in the workspace`);
    } else if (actual !== pinned) {
      failures.push(
        `${dir} pins "${name}@${pinned}" but pnpm resolved ${actual} — the image would ship a ` +
          `different version than the workspace tested`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error("\nruntime manifest check FAILED\n");
  for (const f of failures) console.error(`  ${f}`);
  console.error(
    "\nRegenerate with `pnpm runtime:manifest`, then `npm install --package-lock-only`",
  );
  console.error("in apps/api/runtime and apps/api/runtime-migrate.\n");
  process.exit(1);
}

console.log(
  `runtime manifest: OK — ${RUNTIME_EXTERNAL.length} API + ${MIGRATE_ONLY.length} migrator ` +
    `dependencies pinned to the versions pnpm resolved, both lockfiles present.`,
);
