import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config for this branch's multi-tenancy surface (workspace member management to start).
 * Mirrors the config on `main`'s `test/p3-e2e-critical-flows` line, which this branch predates —
 * ported here rather than waiting for a merge so the new tenancy UI gets coverage now.
 *
 * `webServer` starts BOTH apps/web (3007) and apps/api (3004) the same way locally and in CI —
 * the dev servers, not a production build — so there's exactly one startup path to keep working,
 * not two. `reuseExistingServer` lets a developer already running `pnpm dev:web`/`pnpm dev:api`
 * skip the wait.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["html", { open: "never" }], ["github"]] : "list",
  // `next dev` compiles each route on its FIRST hit in a given server lifetime — independent of
  // the webServer readiness check above, which only proves the process is listening. Measured
  // ~3 minutes for a cold `/sign-in` compile on this monorepo; the default 30s per-test timeout
  // isn't enough for whichever test happens to hit a route first.
  timeout: 180_000,
  // A client-side `router.push()` fetches the destination route's RSC payload before the URL
  // updates — on a first-ever hit that's the same on-demand compile cost as a direct navigation,
  // so this needs the same generous budget as the test timeout above, not `expect`'s 5s default.
  expect: { timeout: 90_000 },
  use: {
    baseURL: "http://localhost:3007",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "auth-setup",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/owner.json" },
      dependencies: ["auth-setup"],
      testIgnore: [/auth\.setup\.ts/],
    },
  ],
  webServer: [
    {
      command: "pnpm dev:api",
      url: "http://localhost:3004/health",
      reuseExistingServer: !process.env.CI,
      // A cold `tsx watch`/`next dev` first compile of this monorepo comfortably exceeds 60s —
      // measured ~90s for the API alone on a cold cache.
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "pnpm dev:web",
      url: "http://localhost:3007/sign-in",
      reuseExistingServer: !process.env.CI,
      // A cold `tsx watch`/`next dev` first compile of this monorepo comfortably exceeds 60s —
      // measured ~90s for the API alone on a cold cache.
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      // `dev:admin` has no explicit port (defaults to Next's 3000), which would collide with
      // whatever else is already using it locally — pinned to 3008 here so it's an address the
      // platform-tenants-console spec can navigate to explicitly, without touching apps/web's
      // baseURL. `PLATFORM_API_URL` has no default in `apps/admin/src/lib/platform-api.ts` — unset,
      // every platform-admin page fails closed with a MISCONFIGURED refusal.
      command: "pnpm dev:admin -- --port 3008",
      url: "http://localhost:3008/tenants",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
      env: { PLATFORM_API_URL: "http://localhost:3004" },
    },
  ],
});
