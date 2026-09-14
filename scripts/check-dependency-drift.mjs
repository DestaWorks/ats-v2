#!/usr/bin/env node
// Fails when two workspace packages pin different versions of the same dependency.
// One dependency, one version, workspace-wide — anything shared belongs in the pnpm
// `catalog:` in pnpm-workspace.yaml rather than being pinned separately in each package.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceFile = join(repoRoot, "pnpm-workspace.yaml");
const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];

function readBlock(key, parse) {
  const lines = readFileSync(workspaceFile, "utf8").split("\n");
  const results = [];
  let inside = false;
  for (const line of lines) {
    if (line.trimEnd() === `${key}:`) {
      inside = true;
      continue;
    }
    if (!inside) continue;
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) break;
    const parsed = parse(line);
    if (parsed) results.push(parsed);
  }
  return results;
}

const unquote = (value) => value.trim().replace(/^["']|["']$/g, "");

const workspaceGlobs = readBlock("packages", (line) => {
  const match = line.match(/^\s+-\s*(.+?)\s*$/);
  return match ? unquote(match[1]) : null;
});

const catalog = new Map(
  readBlock("catalog", (line) => {
    const match = line.match(/^\s+(.+?)\s*:\s*(.+?)\s*$/);
    return match ? [unquote(match[1]), unquote(match[2])] : null;
  }),
);

function manifestPaths() {
  const paths = [join(repoRoot, "package.json")];
  for (const glob of workspaceGlobs) {
    if (!glob.endsWith("/*")) continue;
    const dir = join(repoRoot, glob.slice(0, -2));
    let children = [];
    try {
      children = readdirSync(dir);
    } catch {
      continue;
    }
    for (const child of children) {
      const manifest = join(dir, child, "package.json");
      try {
        if (statSync(manifest).isFile()) paths.push(manifest);
      } catch {
        continue;
      }
    }
  }
  return paths;
}

const manifests = manifestPaths();
/** @type {Map<string, Map<string, string[]>>} dependency -> version spec -> declaring packages */
const specs = new Map();

for (const manifest of manifests) {
  const pkg = JSON.parse(readFileSync(manifest, "utf8"));
  const label = pkg.name ?? relative(repoRoot, dirname(manifest)) ?? ".";
  for (const field of DEP_FIELDS) {
    for (const [name, rawSpec] of Object.entries(pkg[field] ?? {})) {
      if (rawSpec.startsWith("workspace:") || rawSpec.startsWith("link:")) continue;
      const spec = rawSpec === "catalog:" ? (catalog.get(name) ?? "catalog:<undefined>") : rawSpec;
      if (!specs.has(name)) specs.set(name, new Map());
      const bySpec = specs.get(name);
      if (!bySpec.has(spec)) bySpec.set(spec, []);
      bySpec.get(spec).push(`${label} (${field})`);
    }
  }
}

const drift = [...specs].filter(([, bySpec]) => bySpec.size > 1);

if (drift.length === 0) {
  console.log(
    `dependency drift: OK — ${specs.size} dependencies across ${manifests.length} workspace packages, one version each.`,
  );
  process.exit(0);
}

for (const [name, bySpec] of drift) {
  console.error(`\nDRIFT  "${name}" is pinned at ${bySpec.size} different versions:`);
  for (const [spec, declarers] of bySpec) {
    console.error(`  ${spec}  <-  ${declarers.join(", ")}`);
  }
}
console.error(
  "\nFix: move the dependency into the `catalog:` block of pnpm-workspace.yaml and reference it as `catalog:` from every package.",
);
process.exit(1);
