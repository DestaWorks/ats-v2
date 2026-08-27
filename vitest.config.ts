import { resolve } from "node:path";
import { fileURLToPath } from "url";
import { createVitestConfig } from "@destaworks/vitest-config";

const root = fileURLToPath(new URL(".", import.meta.url));
const base = createVitestConfig({ root });

/**
 * Phase 2 moves code out of `src/` into `packages/*`. Two things follow, and both are overridden
 * here rather than in `@destaworks/vitest-config` so the shared tooling stays package-agnostic:
 *
 *  - `include` has to reach the tests that moved with their package.
 *  - `resolve.alias` has to be an ORDERED ARRAY. The transitional `@/*` aliases (mirroring the
 *    `paths` entries in tsconfig.json) are prefix matches, so the catch-all `@` -> src must come
 *    LAST or it shadows every specific entry. They retire together in Phase 2.10.
 *
 * Exported as a plain object, not `defineConfig(...)`: the root and `tooling/vitest` resolve
 * different `vitest` instances, and mixing their types trips `exactOptionalPropertyTypes`.
 */
const config = {
  ...base,
  test: {
    ...base.test,
    include: ["apps/*/src/**/*.{test,spec}.{ts,tsx}", "packages/*/src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: [{ find: "@/", replacement: resolve(root, "apps/web/src/") + "/" }],
  },
};

export default config;
