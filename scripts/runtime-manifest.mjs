/**
 * Write the API image's runtime `package.json` — the few packages the bundle leaves external.
 *
 * `pnpm deploy --legacy` was the obvious tool and it is the wrong one: it copies the whole
 * workspace store, so `--prod` filtered the top-level links while `.pnpm` still carried Next, the
 * SWC binary, TypeScript and Prisma Studio — 923MB of files nothing pointed at.
 *
 * Versions are read from the tree the build just used, so they match its lockfile. Resolved by
 * reading `package.json` off disk rather than `require.resolve`, because a package may not export
 * its own manifest (`@prisma/adapter-pg` does not).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RUNTIME_EXTERNAL } from "../apps/api/externals.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const migrateMode = process.argv.includes("--migrate");
const outDir = process.argv.filter((a) => !a.startsWith("--")).at(-1) ?? "/prod/api";

/** Where a workspace package's own dependencies live, nearest owner first. */
const SEARCH = ["packages/db", "apps/api", "packages/config", "packages/integrations", "."].map(
  (p) => join(repoRoot, p, "node_modules"),
);

function versionOf(name) {
  for (const base of SEARCH) {
    const manifest = join(base, name, "package.json");
    if (existsSync(manifest)) return JSON.parse(readFileSync(manifest, "utf8")).version;
  }
  throw new Error(
    `${name} is external to the bundle but resolvable from none of:\n  ${SEARCH.join("\n  ")}`,
  );
}

/** The migrator runs `prisma migrate deploy` and reads `prisma.config.ts`, which imports dotenv. */
const MIGRATE_ONLY = ["prisma", "dotenv"];

const wanted = migrateMode ? MIGRATE_ONLY : RUNTIME_EXTERNAL;
const dependencies = Object.fromEntries(wanted.map((n) => [n, versionOf(n)]));

mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, "package.json"),
  `${JSON.stringify({ name: migrateMode ? "destaworks-migrate" : "destaworks-api-runtime", private: true, type: "module", dependencies }, null, 2)}\n`,
);
console.log(`runtime manifest -> ${outDir}`);
for (const [n, v] of Object.entries(dependencies)) console.log(`  ${n}@${v}`);
