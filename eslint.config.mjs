import baseConfig from "@destaworks/eslint-config/base";
import nextConfig from "@destaworks/eslint-config/next";

const eslintConfig = [
  // The Next.js app is no longer at the repo root (Phase 2.9 moved it to `apps/web`), so
  // `eslint-plugin-next` has to be told where to look for the app — otherwise its
  // page/link rules warn that they cannot find a pages directory.
  { settings: { next: { rootDir: "apps/*/" } } },
  ...nextConfig,
  ...baseConfig,
];

export default eslintConfig;
