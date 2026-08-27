#!/usr/bin/env node
// Architecture checks for the dependency law in docs/SAAS-RESTRUCTURE-PLAN.md.
//
// Reads the workspace (pnpm-workspace.yaml globs -> package.json manifests) and every import
// specifier in every TypeScript source file, via the TypeScript parser rather than a regex, so a
// manifest that omits a dependency the code imports anyway is still caught.
//
// Exemptions are DATA, not comments: each carries a `reason` and is printed in the report, so a
// permitted violation is visible on every run instead of quietly indistinguishable from a clean one.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_PATH = join(repoRoot, "scripts", "architecture-baseline.json");
const updateBaseline = process.argv.includes("--update-baseline");

/* ------------------------------------------------------------------ the declared law ---- */

/** The dependency graph from SAAS-RESTRUCTURE-PLAN "The dependency law". Package short names. */
const ALLOWED_DEPENDENCIES = {
  domain: [],
  config: [],
  contracts: ["domain"],
  db: ["config", "contracts", "domain"],
  auth: ["config", "db", "domain", "integrations"],
  integrations: ["config", "contracts", "db", "domain"],
  // `config` added to the plan's listed edges: it is a dependency-free leaf (node builtins + pino)
  // holding the Logger and the framework-free `requestContext` adapter that Phase 2.10 moved there
  // to break the auth <-> integrations cycle. db, auth and integrations may all reach it; there is
  // no rule that makes `application` the exception, and it already imports `requestContext`.
  application: ["auth", "config", "contracts", "db", "domain", "integrations"],
  ui: ["domain"],
  web: ["application", "auth", "config", "contracts", "db", "domain", "integrations", "ui"],
  // Phase 4.1. The plan's graph draws api -> {application, auth, contracts}; `config` (the Logger)
  // and `domain` (the capability + status vocabularies a guard decides on) are added for the same
  // reason they were added to `application` above — they are dependency-free leaves every layer
  // may read. `integrations` is here for `http/app-error`, the error envelope the Phase 4.2
  // exception filter maps onto, so the API cannot grow a second copy of the code union.
  // `db` is ABSENT ON PURPOSE and must stay absent: a controller is transport, and the moment it
  // can reach a repository the "one path to the data" decision of Phase 4.0 is gone.
  api: ["application", "auth", "config", "contracts", "domain", "integrations"],
};

const PRISMA_VENDOR = /^(@prisma\/|prisma$)/;
const PRISMA_GENERATED = /generated\/prisma/;
const NEXT_PACKAGE = /^next(\/|$)/;
const UI_PACKAGES = /^(react|react-dom|@destaworks\/ui)(\/|$)/;

/** Packages that run only on a server and may hold the `Prisma` namespace (types + error classes). */
const SERVER_SIDE_PACKAGES = new Set(["db", "application", "auth", "integrations"]);

/** Where `import "server-only"` is allowed to appear at all. See the PERMITTED entry for why. */
const SERVER_ONLY_ALLOWED = new Set(["web"]);

/** Packages that must never see Prisma in any form — browser-reachable, framework-free, or
 *  transport-only. `api` is the last of those: it runs on a server and could technically hold the
 *  `Prisma` namespace, but a controller has no legitimate use for it, so it is classified here
 *  rather than in SERVER_SIDE_PACKAGES and the namespace exemption does not reach it. */
const PRISMA_FREE_PACKAGES = new Set(["domain", "contracts", "config", "ui", "web", "api"]);

/* -------------------------------------------------------------- deliberate exemptions ---- */

const PERMITTED = [
  {
    id: "server-only-in-the-web-app-only",
    rule: "dependency-direction",
    applies: (unit, spec) => SERVER_ONLY_ALLOWED.has(unit.short) && spec === "server-only",
    reason:
      "`server-only` is a Next.js bundler poison pill, not a portable guard: its `exports` map " +
      "resolves to an empty module under the `react-server` condition and to a bare `throw` " +
      "otherwise, so it only means anything inside a bundler that sets that condition. " +
      `PERMITTED only in: ${[...SERVER_ONLY_ALLOWED].sort().join(", ")} — the one unit that IS a ` +
      "Next.js bundle, where a client/server boundary genuinely exists and the pill is what stops " +
      "a server module being pulled into a browser chunk by an accidental client import (a PII " +
      "exposure in this app). It now FAILS in every `packages/*`: those are plain libraries " +
      "consumed by more than one runtime, and the boundary there is enforced by the package graph " +
      "(web cannot import db), `import/no-restricted-paths` in tooling/eslint/base.mjs, and the " +
      "`web-read-path-is-http-only` and `prisma-only-in-db` rules below.",
    debt:
      "Phase 4 removed it from packages/* (117 files across application, db, integrations, auth " +
      "and config): outside a `react-server` bundler condition `server-only` THROWS on import, so " +
      "a NestJS process importing `@destaworks/application` crashed at import time. The " +
      "NODE_OPTIONS=--conditions=react-server prefix on the db:* scripts in package.json is the " +
      "residue of that and can come off once nothing else depends on it. The cap below is now a " +
      "ratchet on apps/web, which must not grow without a deliberate decision.",
    cap: { web: 2 },
  },
  {
    id: "db-reads-cursor-codec-from-contracts",
    rule: "dependency-direction",
    applies: (unit, spec) =>
      unit.short === "db" && spec === "@destaworks/contracts/validation/cursor",
    reason:
      "The ONLY `db -> contracts` import permitted, and only this one module. " +
      "`contracts/validation/cursor.ts` is misfiled: it contains no Zod and no validation — it is a " +
      "pure, isomorphic keyset-pagination codec (`PageCursor`, `ListOrderBy`, encode/decode), which " +
      "is domain material. Repositories legitimately need the cursor type to build a keyset " +
      "predicate. Permitting the module rather than the `db -> contracts` edge means a repository " +
      "importing an actual Zod schema from contracts still FAILS.",
    debt:
      "Fix is a pure move of packages/contracts/src/validation/cursor.ts to " +
      "packages/domain/src/cursor.ts, beside its sibling domain/src/pagination.ts (offset " +
      "pagination). 9 importers to re-point; the module has zero dependencies so nothing else " +
      "moves. That deletes the `db -> contracts` edge from the graph entirely.",
  },
  {
    id: "prisma-namespace-in-server-packages",
    rule: "prisma-only-in-db",
    reason:
      "The `Prisma` NAMESPACE (types such as `Prisma.InputJsonValue` and error classes such as " +
      "`Prisma.PrismaClientKnownRequestError`) may be imported from `@destaworks/db/generated/*` by " +
      "the server-side packages. The plan's forbidden list is `application --X--> Prisma " +
      "IMPLEMENTATIONS`, not the type namespace. Instantiating a client — importing `PrismaClient` " +
      "or the default export, or reaching for the `@prisma/*` vendor packages — still FAILS " +
      "everywhere outside `db`.",
  },
  {
    id: "tests-may-cross-the-web-read-path",
    rule: "web-read-path-is-http-only",
    reason:
      "Route/unit tests under apps/web import `@destaworks/db` and `@destaworks/application` to " +
      "build fixtures and assert service behaviour in-process. Phase 4.0 governs the RUNTIME read " +
      "path, not the test harness, so `*.test.ts` / `*.spec.ts` are exempt. Every one of the 60 " +
      "apps/web files importing `@destaworks/db` today is a test — production code is already clean.",
  },
];

const permittedFor = (rule) => PERMITTED.filter((p) => p.rule === rule);
const isPermitted = (rule, unit, spec) =>
  permittedFor(rule).some((p) => p.applies?.(unit, spec) === true);

/* ------------------------------------------------------------------ workspace reading ---- */

function workspaceGlobs() {
  const lines = readFileSync(join(repoRoot, "pnpm-workspace.yaml"), "utf8").split("\n");
  const globs = [];
  let inside = false;
  for (const line of lines) {
    if (line.trimEnd() === "packages:") {
      inside = true;
      continue;
    }
    if (!inside) continue;
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) break;
    const match = line.match(/^\s+-\s*(.+?)\s*$/);
    if (match) globs.push(match[1].trim().replace(/^["']|["']$/g, ""));
  }
  return globs;
}

const rootManifest = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));

/** Workspace units under apps/* and packages/*. tooling/* is build config, not part of the law. */
function discoverUnits() {
  const units = [];
  for (const glob of workspaceGlobs()) {
    if (!glob.endsWith("/*")) continue;
    const area = glob.slice(0, -2);
    if (area !== "apps" && area !== "packages") continue;
    const areaDir = join(repoRoot, area);
    let children = [];
    try {
      children = readdirSync(areaDir);
    } catch {
      continue;
    }
    for (const child of children) {
      const dir = join(areaDir, child);
      if (!statSync(dir).isDirectory()) continue;
      const manifestPath = join(dir, "package.json");
      const hasOwnManifest = existsSync(manifestPath);
      const manifest = hasOwnManifest
        ? JSON.parse(readFileSync(manifestPath, "utf8"))
        : rootManifest;
      units.push({
        area,
        short: child,
        dir,
        name: hasOwnManifest ? manifest.name : `@destaworks/${child}`,
        manifest,
        hasOwnManifest,
        manifestLabel: hasOwnManifest ? `${area}/${child}/package.json` : "package.json (root)",
      });
    }
  }
  return units;
}

const units = discoverUnits();
const unitByName = new Map(units.map((u) => [u.name, u]));
const unitByShort = new Map(units.map((u) => [u.short, u]));

function unitContaining(absPath) {
  for (const unit of units) {
    if (absPath === unit.dir || absPath.startsWith(unit.dir + sep)) return unit;
  }
  return null;
}

/* --------------------------------------------------------------------- source reading ---- */

function sourceFiles(dir) {
  const out = [];
  const walk = (current) => {
    let entries = [];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "generated" || entry.name === ".next") {
          continue;
        }
        walk(full);
      } else if (/\.(ts|tsx|mts|cts)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
        out.push(full);
      }
    }
  };
  walk(dir);
  return out;
}

/** Every import specifier in a file, via the TypeScript parser. */
function importsIn(file) {
  const text = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const found = [];
  const record = (node, specifier, names = [], hasDefault = false) => {
    found.push({
      specifier,
      names,
      hasDefault,
      line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
    });
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const names = [];
      let hasDefault = false;
      const clause = node.importClause;
      if (clause) {
        if (clause.name) hasDefault = true;
        const bindings = clause.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) names.push(element.name.text);
        } else if (bindings && ts.isNamespaceImport(bindings)) {
          names.push(bindings.name.text);
        }
      }
      record(node, node.moduleSpecifier.text, names, hasDefault);
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      record(node, node.moduleSpecifier.text);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      record(node, node.moduleReference.expression.text);
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      record(node, node.argument.literal.text);
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const isImportCall = callee.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(callee) && callee.text === "require";
      const first = node.arguments[0];
      if ((isImportCall || isRequire) && first && ts.isStringLiteral(first)) {
        record(node, first.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/** Resolve a specifier to `{ kind, unit?, package? }` relative to the importing file. */
function classify(specifier, file, fromUnit) {
  if (specifier.startsWith(".")) {
    const target = resolve(dirname(file), specifier);
    const owner = unitContaining(target);
    if (owner && owner !== fromUnit) return { kind: "internal", unit: owner, viaRelative: true };
    if (!owner) return { kind: "escapes-workspace", path: target };
    return { kind: "self" };
  }
  if (specifier.startsWith("@/")) {
    // Root tsconfig maps `@/*` -> apps/web/src/*.
    const web = unitByShort.get("web");
    if (web && web !== fromUnit) return { kind: "internal", unit: web, viaAlias: true };
    return { kind: "self" };
  }
  const scoped = specifier.startsWith("@");
  const pkg = specifier
    .split("/")
    .slice(0, scoped ? 2 : 1)
    .join("/");
  const owner = unitByName.get(pkg);
  if (owner) return owner === fromUnit ? { kind: "self" } : { kind: "internal", unit: owner };
  if (builtinModules.includes(specifier.replace(/^node:/, ""))) return { kind: "builtin" };
  return { kind: "external", package: pkg };
}

/* ---------------------------------------------------------------------------- scanning ---- */

const records = [];
for (const unit of units) {
  const root = existsSync(join(unit.dir, "src")) ? join(unit.dir, "src") : unit.dir;
  for (const file of sourceFiles(root)) {
    const rel = relative(repoRoot, file);
    const isTest = /\.(test|spec)\.(ts|tsx)$/.test(file);
    for (const imp of importsIn(file)) {
      records.push({
        unit,
        file,
        rel,
        isTest,
        ...imp,
        target: classify(imp.specifier, file, unit),
      });
    }
  }
}

/* ------------------------------------------------------------------------------ checks ---- */

const checks = [];
const at = (r) => `${r.rel}:${r.line}`;

function check(id, title, run) {
  const violations = [];
  run((message, record) => violations.push({ message, where: record ? at(record) : null }));
  checks.push({ id, title, violations });
}

// 1. Dependency direction matches the declared graph — in source AND in the manifests.
check("dependency-direction", "Dependency direction matches the declared graph", (fail) => {
  const declared = new Set();
  for (const r of records) {
    if (r.target.kind !== "internal") continue;
    const allowed = ALLOWED_DEPENDENCIES[r.unit.short] ?? [];
    declared.add(`${r.unit.short}->${r.target.unit.short}`);
    if (allowed.includes(r.target.unit.short)) continue;
    if (isPermitted("dependency-direction", r.unit, r.specifier)) continue;
    fail(
      `${r.unit.short} -> ${r.target.unit.short} is not a declared edge` +
        `${r.target.viaRelative ? " (reached by a relative path escaping the package)" : ""}` +
        `${r.target.viaAlias ? " (reached through the `@/` alias)" : ""}` +
        `  [${r.specifier}]`,
      r,
    );
  }
  // A manifest may not declare an edge the graph forbids.
  for (const unit of units) {
    const allowed = ALLOWED_DEPENDENCIES[unit.short] ?? [];
    for (const field of ["dependencies", "peerDependencies"]) {
      for (const name of Object.keys(unit.manifest[field] ?? {})) {
        const dep = unitByName.get(name);
        if (!dep || dep === unit) continue;
        if (!allowed.includes(dep.short)) {
          fail(
            `${unit.manifestLabel} declares "${name}" in ${field}, but ${unit.short} -> ${dep.short} is not a declared edge`,
          );
        }
      }
    }
  }
  // The interesting failure: source imports a workspace package the manifest never declares.
  for (const r of records) {
    if (r.target.kind !== "internal" || r.target.viaAlias || r.target.viaRelative) continue;
    if (!r.unit.hasOwnManifest) continue;
    const m = r.unit.manifest;
    const declaredDep =
      (m.dependencies ?? {})[r.target.unit.name] ??
      (m.devDependencies ?? {})[r.target.unit.name] ??
      (m.peerDependencies ?? {})[r.target.unit.name];
    if (declaredDep === undefined) {
      fail(
        `${r.unit.short} imports "${r.target.unit.name}" but ${r.unit.manifestLabel} does not declare it`,
        r,
      );
    }
  }
  // `server-only` is a deliberate framework coupling — it is allowed only where it was decided to be.
  for (const r of records) {
    if (r.specifier !== "server-only") continue;
    if (SERVER_ONLY_ALLOWED.has(r.unit.short)) continue;
    fail(
      `${r.unit.short} imports \`server-only\` — it is a bundler-specific poison pill that THROWS ` +
        `on import outside a \`react-server\` condition, so it breaks every non-Next consumer ` +
        `(NestJS, tsx scripts, workers). Packages stay runtime-agnostic; the client/server ` +
        `boundary is enforced by the package graph, import/no-restricted-paths and the rules in ` +
        `this file. Permitted only in ${[...SERVER_ONLY_ALLOWED].sort().join(", ")}`,
      r,
    );
  }
  // Externals the code imports but no manifest declares (root manifest covers the app).
  for (const r of records) {
    if (r.target.kind !== "external" || r.isTest || !r.unit.hasOwnManifest) continue;
    const m = r.unit.manifest;
    const known =
      (m.dependencies ?? {})[r.target.package] ??
      (m.devDependencies ?? {})[r.target.package] ??
      (m.peerDependencies ?? {})[r.target.package];
    if (known === undefined) {
      fail(`${r.unit.short} imports external "${r.target.package}" undeclared in its manifest`, r);
    }
  }
});

// 2. The `--X-->` forbidden list.
check("forbidden-imports", "Forbidden imports (the --X--> list)", (fail) => {
  for (const r of records) {
    const from = r.unit.short;
    const spec = r.specifier;
    const targetShort = r.target.kind === "internal" ? r.target.unit.short : null;

    if (from === "web" && targetShort === "db" && !r.isTest) {
      fail(`web --X--> db  [${spec}]`, r);
    }
    if (from === "web" && (PRISMA_VENDOR.test(spec) || PRISMA_GENERATED.test(spec))) {
      fail(`web --X--> Prisma  [${spec}]`, r);
    }
    // Phase 4.1: `apps/api` never imports Prisma or `@destaworks/db` directly. Unlike the web rule
    // there is no test exemption — an API test that needs a repository is asserting the service
    // layer's job, in the wrong package.
    if (from === "api" && targetShort === "db") {
      fail(`api --X--> db  [${spec}]`, r);
    }
    if (from === "api" && (PRISMA_VENDOR.test(spec) || PRISMA_GENERATED.test(spec))) {
      fail(`api --X--> Prisma  [${spec}]`, r);
    }
    if (from === "domain" && (PRISMA_VENDOR.test(spec) || PRISMA_GENERATED.test(spec))) {
      fail(`domain --X--> Prisma  [${spec}]`, r);
    }
    if (from === "domain" && NEXT_PACKAGE.test(spec)) {
      fail(`domain --X--> Next.js  [${spec}]`, r);
    }
    if (from === "domain" && UI_PACKAGES.test(spec)) {
      fail(`domain --X--> a UI package  [${spec}]`, r);
    }
    if (
      r.unit.area === "packages" &&
      r.target.kind === "internal" &&
      r.target.unit.area === "apps"
    ) {
      fail(`packages --X--> apps (${from} -> ${r.target.unit.short})  [${spec}]`, r);
    }
  }
});

// 3. No circular dependencies between packages.
check("no-cycles", "No circular dependencies between packages", (fail) => {
  const edges = new Map(units.map((u) => [u.short, new Set()]));
  const example = new Map();
  for (const r of records) {
    if (r.target.kind !== "internal") continue;
    edges.get(r.unit.short).add(r.target.unit.short);
    const key = `${r.unit.short}->${r.target.unit.short}`;
    if (!example.has(key)) example.set(key, r);
  }
  const state = new Map();
  const stack = [];
  const reported = new Set();
  const visit = (node) => {
    state.set(node, "open");
    stack.push(node);
    for (const next of edges.get(node) ?? []) {
      if (state.get(next) === "open") {
        const cycle = stack.slice(stack.indexOf(next)).concat(next);
        const key = [...cycle].sort().join(",");
        if (!reported.has(key)) {
          reported.add(key);
          const hops = [];
          for (let i = 0; i < cycle.length - 1; i += 1) {
            const r = example.get(`${cycle[i]}->${cycle[i + 1]}`);
            hops.push(`      ${cycle[i]} -> ${cycle[i + 1]}  via ${r ? at(r) : "?"}`);
          }
          fail(`cycle: ${cycle.join(" -> ")}\n${hops.join("\n")}`);
        }
      } else if (!state.has(next)) {
        visit(next);
      }
    }
    stack.pop();
    state.set(node, "closed");
  };
  for (const unit of units) if (!state.has(unit.short)) visit(unit.short);
});

// 4. Prisma is imported only inside @destaworks/db.
check("prisma-only-in-db", "Prisma imported only inside @destaworks/db", (fail) => {
  for (const r of records) {
    const from = r.unit.short;
    const spec = r.specifier;
    if (from === "db") continue;
    const vendor = PRISMA_VENDOR.test(spec);
    const generated = PRISMA_GENERATED.test(spec);
    if (!vendor && !generated) continue;

    if (vendor) {
      fail(`${from} imports the Prisma vendor package "${spec}" — only db may`, r);
      continue;
    }
    if (PRISMA_FREE_PACKAGES.has(from)) {
      fail(`${from} imports generated Prisma "${spec}" — only db may`, r);
      continue;
    }
    // Fail closed: the `Prisma` namespace permit covers only packages classified server-side.
    // A package added later and left unclassified does not inherit the exemption by default.
    if (!SERVER_SIDE_PACKAGES.has(from)) {
      fail(
        `${from} imports generated Prisma "${spec}" but is not classified as a server-side package — ` +
          `classify it in SERVER_SIDE_PACKAGES or PRISMA_FREE_PACKAGES before granting it Prisma types`,
        r,
      );
      continue;
    }
    const instantiating = r.hasDefault || r.names.includes("PrismaClient");
    if (instantiating) {
      fail(
        `${from} imports ${r.hasDefault ? "the default export" : "PrismaClient"} from "${spec}" — only db may instantiate a client`,
        r,
      );
    }
  }
});

// 5. @destaworks/domain declares no runtime dependencies.
check(
  "domain-has-no-runtime-deps",
  "@destaworks/domain declares no runtime dependencies",
  (fail) => {
    const domain = unitByShort.get("domain");
    if (!domain) {
      fail("packages/domain not found in the workspace");
      return;
    }
    for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
      for (const name of Object.keys(domain.manifest[field] ?? {})) {
        fail(
          `packages/domain/package.json declares "${name}" in ${field} — domain must be dependency-free`,
        );
      }
    }
    for (const r of records) {
      if (r.unit.short !== "domain") continue;
      if (r.target.kind === "external" && !r.isTest) {
        fail(
          `domain imports external package "${r.target.package}" — domain must be pure TypeScript`,
          r,
        );
      }
      if (r.target.kind === "internal") {
        fail(
          `domain imports workspace package "${r.target.unit.name}" — domain depends on nothing`,
          r,
        );
      }
    }
  },
);

// 6. Packages never import from apps.
check("packages-never-import-apps", "Packages never import from apps/", (fail) => {
  for (const r of records) {
    if (r.unit.area !== "packages") continue;
    if (r.target.kind === "internal" && r.target.unit.area === "apps") {
      fail(`${r.unit.short} imports app "${r.target.unit.name}"  [${r.specifier}]`, r);
    } else if (
      r.target.kind === "escapes-workspace" &&
      r.target.path.includes(`${sep}apps${sep}`)
    ) {
      fail(`${r.unit.short} reaches into apps/ by relative path  [${r.specifier}]`, r);
    }
  }
});

// 7. apps/web never imports @destaworks/db or @destaworks/application (Phase 4.0: HTTP only).
const baseline = existsSync(BASELINE_PATH)
  ? JSON.parse(readFileSync(BASELINE_PATH, "utf8"))
  : { webReadPath: [] };
const currentReadPath = [
  ...new Set(
    records
      .filter(
        (r) =>
          r.unit.short === "web" &&
          !r.isTest &&
          r.target.kind === "internal" &&
          (r.target.unit.short === "db" || r.target.unit.short === "application"),
      )
      .map((r) => r.rel),
  ),
].sort();

if (updateBaseline) {
  writeFileSync(BASELINE_PATH, `${JSON.stringify({ webReadPath: currentReadPath }, null, 2)}\n`);
  console.log(`baseline updated: ${currentReadPath.length} files under webReadPath`);
  process.exit(0);
}

check(
  "web-read-path-is-http-only",
  "apps/web never imports @destaworks/db or @destaworks/application (Phase 4.0)",
  (fail) => {
    const known = new Set(baseline.webReadPath ?? []);
    for (const r of records) {
      if (r.unit.short !== "web" || r.isTest) continue;
      if (r.target.kind !== "internal") continue;
      const t = r.target.unit.short;
      if (t !== "db" && t !== "application") continue;
      if (known.has(r.rel)) continue;
      fail(
        `apps/web --X--> ${t}: the read path is HTTP only (Phase 4.0 Option A). ` +
          `"${r.rel}" is not in the ratchet baseline  [${r.specifier}]`,
        r,
      );
    }
    const stale = [...known].filter((f) => !currentReadPath.includes(f));
    for (const f of stale) {
      fail(
        `baseline lists "${f}" but it no longer imports db/application — ` +
          `run \`pnpm app:arch-check --update-baseline\` to ratchet the baseline down`,
      );
    }
  },
);

/* ------------------------------------------------------------------------------ report ---- */

const failed = checks.filter((c) => c.violations.length > 0);
const fileCount = new Set(records.map((r) => r.rel)).size;

console.log(
  `architecture check — ${checks.length} rules over ${records.length} imports in ${fileCount} files across ${units.length} workspace units\n`,
);

for (const c of checks) {
  const status = c.violations.length === 0 ? "PASS" : `FAIL (${c.violations.length})`;
  console.log(`  ${c.violations.length === 0 ? "ok  " : "FAIL"}  ${c.id.padEnd(30)} ${status}`);
}

// Permitted exemptions are printed on every run, passing or failing.
console.log("\ndeliberate exemptions (permitted, with reason):");
for (const p of PERMITTED) {
  console.log(`\n  [${p.rule}] ${p.id}`);
  console.log(`    reason: ${p.reason}`);
  if (p.debt) console.log(`    debt:   ${p.debt}`);
}

const cap = PERMITTED.find((p) => p.id === "server-only-in-the-web-app-only")?.cap ?? {};
const serverOnlyCounts = {};
for (const r of records) {
  if (r.specifier !== "server-only") continue;
  serverOnlyCounts[r.unit.short] = (serverOnlyCounts[r.unit.short] ?? 0) + 1;
}
const capBreaches = Object.entries(cap).filter(([pkg, max]) => (serverOnlyCounts[pkg] ?? 0) > max);
console.log(
  `\n  server-only file counts: ${Object.entries(serverOnlyCounts)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join(" ")}`,
);
for (const [pkg, max] of capBreaches) {
  console.error(
    `\nFAIL  server-only spread: ${pkg} now imports \`server-only\` in ${serverOnlyCounts[pkg]} files, cap is ${max}.\n` +
      `      The exemption is frozen at the size Phase 4 left it, so the pill cannot spread again.\n` +
      `      Raise the cap deliberately in scripts/check-architecture.mjs, or do not add the import.`,
  );
}

const webBaselineSize = (baseline.webReadPath ?? []).length;
console.log(
  `  web read-path ratchet: ${currentReadPath.length} non-test files import db/application ` +
    `(baseline ${webBaselineSize}) — Phase 4.3 drives this to 0`,
);

if (failed.length === 0 && capBreaches.length === 0) {
  console.log("\narchitecture check: OK — the dependency law holds.");
  process.exit(0);
}

for (const c of failed) {
  console.error(`\n${"=".repeat(78)}\nFAIL  ${c.id} — ${c.title}\n`);
  for (const v of c.violations) {
    console.error(v.where ? `  ${v.where}\n      ${v.message}` : `  ${v.message}`);
  }
}
console.error(
  `\n${failed.length} of ${checks.length} architecture rules failed. ` +
    `The dependency law is docs/SAAS-RESTRUCTURE-PLAN.md "The dependency law".`,
);
process.exit(1);
