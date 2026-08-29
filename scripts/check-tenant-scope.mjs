#!/usr/bin/env node
// Tenant-scoping checks for the enforcement seam in docs/SAAS-RESTRUCTURE-PLAN.md 6.3.
//
// 6.3's done-when is "a repository call cannot omit tenant scoping and still compile". The type
// system gets most of the way there — `db(ctx, tx)` cannot be called without a context — but two
// gaps stay open that only a check like this can close:
//
//   1. A repository method could simply not take a context, and go on querying every tenant's rows.
//      Nothing fails to compile; the method just never scopes.
//   2. The 6.3 -> 6.4 bridge (`bridgeUnscopedCallers`) deliberately accepts the pre-6.3 call shape
//      so the services above can migrate separately. That escape hatch has to shrink, and only a
//      ratchet makes "shrink" enforceable rather than intended.
//
// The allowlist of models that legitimately live outside any tenant is READ FROM the seam itself
// rather than restated here, so the two cannot drift apart.
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_PATH = join(repoRoot, "scripts", "tenant-scope-baseline.json");
const updateBaseline = process.argv.includes("--update-baseline");

// `GLOBAL_MODELS` lives in its own module: 6.6's RLS coverage check reads the same list, and two
// checks parsing one literal out of two different files is how they end up disagreeing.
const MODELS = join(repoRoot, "packages/db/src/tenant-models.ts");
const REPOSITORY_DIR = join(repoRoot, "packages/db/src/repositories");

/**
 * Repositories that serve ONLY the global models, and so keep the unscoped client. Data, not a
 * comment: each carries a reason, is printed on every run, and is verified below to touch nothing
 * but the models the seam itself lists as global — an allowlist that is not checked is a hole.
 */
const GLOBAL_REPOSITORIES = [
  {
    file: "user.repository.ts",
    reason:
      "reads the User table only. One human has one login across every tenant; the per-tenant " +
      "facts live on Membership, so scoping a user lookup would break tenant switching outright.",
  },
  {
    file: "schedule-run.repository.ts",
    reason:
      "ScheduleRun is platform infrastructure — one claim per (schedule, occurrence) for the " +
      "whole install, written by a scheduler that runs outside any request and any tenant.",
  },
  {
    file: "health.repository.ts",
    reason:
      "a `SELECT 1` liveness ping against the pool. Touches no model at all, so there is nothing " +
      "for the seam to scope.",
  },
];
const ALLOWLISTED = new Set(GLOBAL_REPOSITORIES.map((r) => r.file));

/** Scale floors — a parser that silently stops matching must fail, not report a clean tree. */
const FLOORS = { scopedRepositories: 30, scopedMethods: 200 };

/* ------------------------------------------------------------------------ check plumbing ---- */

const checks = [];
function check(id, title, run) {
  const violations = [];
  run((message, where) => violations.push({ message, where }));
  checks.push({ id, title, violations });
}

function parse(path) {
  return ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TS,
  );
}

function walk(node, visit) {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

function at(sf, node) {
  const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  return `${relative(repoRoot, sf.fileName)}:${line + 1}`;
}

/* ------------------------------------------------------ the seam's own list of global models ---- */

/** The `GLOBAL_MODELS` set literal in tenant-scope.ts, so this check enforces the seam's list. */
function readGlobalModels() {
  const sf = parse(MODELS);
  let models;
  walk(sf, (node) => {
    if (!ts.isVariableDeclaration(node)) return;
    if (!ts.isIdentifier(node.name) || node.name.text !== "GLOBAL_MODELS") return;
    const literal = node.initializer;
    if (!literal || !ts.isNewExpression(literal)) return;
    const [arg] = literal.arguments ?? [];
    if (!arg || !ts.isArrayLiteralExpression(arg)) return;
    models = new Set(arg.elements.filter(ts.isStringLiteral).map((e) => e.text));
  });
  if (!models || models.size === 0) {
    console.error("FAIL  could not read GLOBAL_MODELS out of packages/db/src/tenant-models.ts");
    process.exit(1);
  }
  return models;
}

const GLOBAL_MODELS = readGlobalModels();

/* -------------------------------------------------------------- the repository layer, parsed ---- */

const repositoryFiles = readdirSync(REPOSITORY_DIR)
  .filter((f) => f.endsWith(".repository.ts"))
  .sort();

/** The exported `…Repository` object of one file, plus what it touches. */
function readRepository(file) {
  const sf = parse(join(REPOSITORY_DIR, file));
  /** @type {{name: string, params: ts.ParameterDeclaration[], node: ts.Node}[]} */
  const methods = [];
  const models = new Set();
  let objectFound = false;

  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    if (!stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !decl.name.text.endsWith("Repository")) continue;
      let init = decl.initializer;
      // `export const xRepository = bridgeUnscopedCallers({ … })` — unwrap the 6.3 bridge.
      if (init && ts.isCallExpression(init) && init.arguments.length === 1)
        init = init.arguments[0];
      if (!init || !ts.isObjectLiteralExpression(init)) continue;
      objectFound = true;
      for (const prop of init.properties) {
        if (ts.isMethodDeclaration(prop) && ts.isIdentifier(prop.name)) {
          methods.push({ name: prop.name.text, params: [...prop.parameters], node: prop });
        } else if (
          ts.isPropertyAssignment(prop) &&
          ts.isIdentifier(prop.name) &&
          (ts.isArrowFunction(prop.initializer) || ts.isFunctionExpression(prop.initializer))
        ) {
          methods.push({
            name: prop.name.text,
            params: [...prop.initializer.parameters],
            node: prop,
          });
        }
      }
    }
  }

  // Which Prisma models the file queries: `db(…).candidate`, `prisma.user`, `client.sourceLead`.
  walk(sf, (node) => {
    if (!ts.isPropertyAccessExpression(node)) return;
    const owner = node.expression;
    const isClient =
      (ts.isCallExpression(owner) &&
        ts.isIdentifier(owner.expression) &&
        (owner.expression.text === "db" || owner.expression.text === "dbUnscoped")) ||
      (ts.isIdentifier(owner) && (owner.text === "prisma" || owner.text === "client"));
    if (!isClient) return;
    const name = node.name.text;
    if (name.startsWith("$")) return;
    models.add(name.charAt(0).toUpperCase() + name.slice(1));
  });

  return { sf, methods, models, objectFound };
}

const repositories = new Map(repositoryFiles.map((f) => [f, readRepository(f)]));

/* ------------------------------------------------------------------------------- the rules ---- */

let scopedMethodCount = 0;
const scopedFiles = repositoryFiles.filter((f) => !ALLOWLISTED.has(f));

check(
  "repository-methods-take-a-context",
  "every method of a tenant-scoped repository declares `ctx: TenantContext` first (6.3)",
  (fail) => {
    for (const file of scopedFiles) {
      const repo = repositories.get(file);
      if (!repo.objectFound) {
        fail(`no exported \`…Repository\` object literal found in ${file} — the parser is lost`);
        continue;
      }
      for (const method of repo.methods) {
        scopedMethodCount++;
        const first = method.params[0];
        const type = first?.type ? first.type.getText(repo.sf) : undefined;
        if (type === "TenantContext") continue;
        fail(
          `${method.name}() takes ${type ? `\`${type}\`` : "no argument"} first, not ` +
            `\`ctx: TenantContext\` — it can query every tenant's rows and still compile`,
          at(repo.sf, method.node),
        );
      }
    }
  },
);

check(
  "global-repositories-touch-only-global-models",
  "the unscoped-repository allowlist matches the seam's GLOBAL_MODELS (6.3)",
  (fail) => {
    for (const { file } of GLOBAL_REPOSITORIES) {
      const repo = repositories.get(file);
      if (!repo) {
        fail(`allowlisted repository ${file} no longer exists — drop it from the allowlist`);
        continue;
      }
      for (const model of repo.models) {
        if (GLOBAL_MODELS.has(model)) continue;
        fail(
          `${file} queries \`${model}\`, which is tenant-scoped. The allowlist exempts it from ` +
            `the seam, so this read crosses every tenant in the install`,
        );
      }
    }
  },
);

check(
  "scoped-repositories-use-the-seam",
  "a tenant-scoped repository imports its client from the seam, never from ../prisma (6.3)",
  (fail) => {
    for (const file of scopedFiles) {
      const repo = repositories.get(file);
      for (const stmt of repo.sf.statements) {
        if (!ts.isImportDeclaration(stmt)) continue;
        if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue;
        if (stmt.moduleSpecifier.text !== "../prisma") continue;
        fail(
          `${file} imports from "../prisma" — the raw client bypasses the tenant filter. ` +
            `Import \`db\` from "../tenant-scope", or add the file to the allowlist with a reason`,
          at(repo.sf, stmt),
        );
      }
    }
  },
);

check(
  "internal-repository-calls-pass-a-context",
  "inside packages/db, a repository call passes its context (the bridge would accept it without)",
  (fail) => {
    for (const [file, repo] of repositories) {
      if (ALLOWLISTED.has(file)) continue;
      walk(repo.sf, (node) => {
        if (!ts.isCallExpression(node)) return;
        const callee = node.expression;
        if (!ts.isPropertyAccessExpression(callee)) return;
        if (!ts.isIdentifier(callee.expression)) return;
        const owner = callee.expression.text;
        if (owner !== "this" && !owner.endsWith("Repository")) return;
        const [first] = node.arguments;
        if (first && ts.isIdentifier(first) && first.text === "ctx") return;
        fail(
          `${owner}.${callee.name.text}(…) is called without a context. The 6.3 bridge accepts ` +
            `the short form, so this compiles and runs unscoped`,
          at(repo.sf, node),
        );
      });
    }
  },
);

/* --------------------------------------------------------------------------- the ratchet ---- */

/**
 * The escape hatches that let pre-6.3 code keep working. Every one is deleted by the end of 6.4;
 * until then the only property worth enforcing is that their number falls.
 */
const ESCAPE_HATCHES = new Set([
  "dbUnscoped",
  "UNSCOPED_CONTEXT",
  "bridgeUnscopedCallers",
  "withTransaction",
]);

/** Source files to sweep — every workspace package and app, tests included. */
function sourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "generated" || entry.name.startsWith("."))
      continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Identifier REFERENCES, via the parser — not a text search. A doc comment explaining why
 * `dbUnscoped` exists is not a use of it, and counting prose would make the ratchet meaningless.
 */
const usesByFile = {};
const usesByHatch = Object.fromEntries([...ESCAPE_HATCHES].map((h) => [h, 0]));
for (const dir of ["apps", "packages"]) {
  for (const path of sourceFiles(join(repoRoot, dir))) {
    const sf = parse(path);
    let count = 0;
    walk(sf, (node) => {
      if (!ts.isIdentifier(node) || !ESCAPE_HATCHES.has(node.text)) return;
      // The declaration of a hatch is not a use of it.
      const parent = node.parent;
      if (
        (ts.isFunctionDeclaration(parent) || ts.isVariableDeclaration(parent)) &&
        parent.name === node
      )
        return;
      count++;
      usesByHatch[node.text]++;
    });
    if (count > 0) usesByFile[relative(repoRoot, path)] = count;
  }
}

const baseline = existsSync(BASELINE_PATH)
  ? JSON.parse(readFileSync(BASELINE_PATH, "utf8"))
  : { unscopedUses: {} };

if (updateBaseline) {
  const sorted = Object.fromEntries(
    Object.entries(usesByFile).sort(([a], [b]) => (a < b ? -1 : 1)),
  );
  writeFileSync(BASELINE_PATH, `${JSON.stringify({ unscopedUses: sorted }, null, 2)}\n`);
  const total = Object.values(sorted).reduce((a, b) => a + b, 0);
  console.log(
    `baseline updated: ${total} escape-hatch uses across ${Object.keys(sorted).length} files`,
  );
  process.exit(0);
}

const known = baseline.unscopedUses ?? {};
check(
  "unscoped-escape-hatches-only-fall",
  "no new use of dbUnscoped / UNSCOPED_CONTEXT / bridgeUnscopedCallers / withTransaction (6.3)",
  (fail) => {
    for (const [file, count] of Object.entries(usesByFile)) {
      const allowed = known[file];
      if (allowed === undefined) {
        fail(
          `${file} uses an unscoped escape hatch (${count}×) and is not in the ratchet baseline. ` +
            `Take a TenantContext and call \`db(ctx, tx)\` instead`,
        );
      } else if (count > allowed) {
        fail(`${file}: ${count} escape-hatch uses, baseline allows ${allowed} — the debt grew`);
      }
    }
    for (const [file, allowed] of Object.entries(known)) {
      const count = usesByFile[file] ?? 0;
      if (count < allowed) {
        fail(
          `${file}: down to ${count} escape-hatch uses from ${allowed} — run ` +
            `\`pnpm app:tenant-check --update-baseline\` to ratchet the baseline down`,
        );
      }
    }
  },
);

check(
  "parser-still-sees-the-repository-layer",
  "scale floors on what was actually parsed",
  (fail) => {
    if (scopedFiles.length < FLOORS.scopedRepositories)
      fail(
        `only ${scopedFiles.length} tenant-scoped repositories found (floor ` +
          `${FLOORS.scopedRepositories}) — the parser is broken, not the layer`,
      );
    if (scopedMethodCount < FLOORS.scopedMethods)
      fail(
        `only ${scopedMethodCount} repository methods inspected (floor ${FLOORS.scopedMethods}) — ` +
          `the parser is broken, not the layer`,
      );
  },
);

/* ------------------------------------------------------------------------------- report ---- */

const totalUses = Object.values(usesByFile).reduce((a, b) => a + b, 0);
const baselineTotal = Object.values(known).reduce((a, b) => a + b, 0);

console.log(
  `tenant-scope check — ${checks.length} rules over ${repositoryFiles.length} repositories ` +
    `(${scopedFiles.length} tenant-scoped, ${scopedMethodCount} methods)\n`,
);
for (const c of checks) {
  const status = c.violations.length === 0 ? "PASS" : `FAIL (${c.violations.length})`;
  console.log(`  ${c.violations.length === 0 ? "ok  " : "FAIL"}  ${c.id.padEnd(42)} ${status}`);
}

console.log("\nunscoped repositories (permitted, with reason):");
for (const r of GLOBAL_REPOSITORIES) {
  console.log(`\n  ${r.file}`);
  console.log(`    reason: ${r.reason}`);
}
console.log(`\n  seam allowlist (GLOBAL_MODELS): ${[...GLOBAL_MODELS].sort().join(", ")}`);

console.log(
  `\n  escape-hatch ratchet: ${totalUses} uses in ${Object.keys(usesByFile).length} files ` +
    `(baseline ${baselineTotal}) — ${Object.entries(usesByHatch)
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join(" ")}\n  6.4 drives this to 0.`,
);

const failed = checks.filter((c) => c.violations.length > 0);
if (failed.length === 0) {
  console.log("\ntenant-scope check: OK — no repository method can query without a tenant.");
  process.exit(0);
}
for (const c of failed) {
  console.error(`\n${"=".repeat(78)}\nFAIL  ${c.id} — ${c.title}\n`);
  for (const v of c.violations) {
    console.error(v.where ? `  ${v.where}\n      ${v.message}` : `  ${v.message}`);
  }
}
console.error(
  `\n${failed.length} of ${checks.length} tenant-scope rules failed. ` +
    `The seam is packages/db/src/tenant-scope.ts; the phase is SAAS-RESTRUCTURE-PLAN 6.3.`,
);
process.exit(1);
