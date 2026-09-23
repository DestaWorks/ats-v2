import { defineConfig, devices } from "@playwright/test";

const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3008";

/** `E2E_STRICT_SERVERS` forces the suite to start its own servers rather than reuse a port. */
const REUSE_SERVERS = !process.env.CI && process.env["E2E_STRICT_SERVERS"] !== "1";

/**
 * E2E config for the four critical flows (sign-in, add/move candidate, promote lead, parse
 * resume) — docs/STACK-ARCHITECTURE.md and docs/CONVENTIONS.md both name Playwright for this.
 *
 * `webServer` starts BOTH apps/web (3007) and apps/api (3004) the same way locally and in CI —
 * the dev servers, not a production build — so there's exactly one startup path to keep working,
 * not two. `reuseExistingServer` lets a developer already running `pnpm dev:web`/`pnpm dev:api`
 * skip the wait.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/fixtures/global-setup.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report/html", open: "never" }],
    ["json", { outputFile: "playwright-report/results.json" }],
    ...(process.env.CI ? ([["github"]] as const) : ([] as const)),
  ],
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
      name: "unauthenticated",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /sign-in\.spec\.ts/,
    },
    {
      name: "auth-setup",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/owner.json" },
      dependencies: ["auth-setup"],
      testIgnore: [/auth\.setup\.ts/, /sign-in\.spec\.ts/],
    },
  ],
  webServer: [
    {
      command: "pnpm dev:api",
      url: "http://localhost:3004/health",
      reuseExistingServer: REUSE_SERVERS,
      // A cold `tsx watch`/`next dev` first compile of this monorepo comfortably exceeds 60s —
      // measured ~90s for the API alone on a cold cache.
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "pnpm dev:web",
      url: "http://localhost:3007/sign-in",
      reuseExistingServer: REUSE_SERVERS,
      // The suite signs in as six different accounts well inside Better Auth's 60s window, and the
      // sixth would be refused — raised HERE so the ceiling itself stays 5 everywhere else.
      env: { E2E_SIGNIN_RATE_MAX: "100" },
      // A cold `tsx watch`/`next dev` first compile of this monorepo comfortably exceeds 60s —
      // measured ~90s for the API alone on a cold cache.
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      // `dev:admin` has no explicit port (defaults to Next's 3000), which would collide with
      // whatever else is already using it locally — pinned to 3008 so the platform-console spec
      // can navigate to it explicitly without touching apps/web's baseURL. `PLATFORM_API_URL` has
      // no default, and unset makes every platform-admin page fail closed with a refusal.
      command: `pnpm dev:admin --port ${ADMIN_PORT}`,
      url: `http://localhost:${ADMIN_PORT}/tenants`,
      reuseExistingServer: REUSE_SERVERS,
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
      env: { PLATFORM_API_URL: "http://localhost:3004" },
    },
  ],
});
