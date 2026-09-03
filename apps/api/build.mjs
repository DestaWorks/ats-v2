import { build } from "esbuild";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { EXTERNAL } from "./externals.mjs";

/**
 * Bundle the API into a single file so production runs plain `node dist/main.js`.
 *
 * A bundle rather than `tsc` because the workspace packages export TypeScript source directly —
 * `@destaworks/db` resolves to `src/lifecycle.ts`, not a built `.js` — so there is no compiled
 * package graph for Node to resolve at runtime. Bundling follows those source entry points the
 * same way tsx and Next do, and yields one immutable artefact the deploy can hash.
 *
 * Running plain node also fixes a real defect: under `tsx` the runner terminates the process on
 * SIGTERM before the shutdown handler finishes draining, so the API exited 143 with in-flight
 * requests still open. Under node the handler owns the signal.
 *
 * Prisma stays external — it loads its query engine by path at runtime and a bundler cannot
 * relocate that binary correctly.
 */
await build({
  absWorkingDir: dirname(fileURLToPath(import.meta.url)),
  // Two entry points, one bundle each: the API server and the job worker are separate processes
  // (see src/worker.ts) built from the same source graph, so they cannot drift in the version of a
  // service they share.
  entryPoints: ["src/main.ts", "src/worker.ts"],
  outdir: "dist",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  // Only the packages that cannot survive bundling are external. Notably NOT `packages:
  // "external"` — that externalises every bare import including `@destaworks/*`, and those
  // resolve to TypeScript source that Node cannot load, so the bundle would die on its first
  // import. Prisma and pg carry native binaries loaded by path at runtime.
  external: EXTERNAL,
  banner: {
    js: "import{createRequire as __cr}from'module';const require=__cr(import.meta.url);",
  },
});
