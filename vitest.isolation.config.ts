/**
 * The isolation suite runs on its own, not as part of `pnpm app:test`.
 *
 * Two reasons. It needs a real Postgres, which the unit suite deliberately does not, so folding it
 * in would make every unit run depend on a database. And it must be its own named CI step: a rule
 * nobody can point at in the pipeline is the failure mode Phase 6.7 exists to end.
 *
 * The files live in `packages/db/isolation/`, outside any `src/` directory, which is also what
 * keeps the root config's per-package source glob from picking them up.
 */
const config = {
  test: {
    environment: "node",
    include: ["packages/db/isolation/**/*.test.ts"],
    globals: true,
    // One database, one connection, shared fixtures. Parallel files would race on the seed and on
    // the negative control's DROP POLICY.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
};

export default config;
