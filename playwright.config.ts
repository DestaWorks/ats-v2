import { defineConfig, devices } from "@playwright/test";

const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3008";

/** `E2E_STRICT_SERVERS` forces the suite to start its own servers rather than reuse a port. */
const REUSE_SERVERS = !process.env.CI && process.env["E2E_STRICT_SERVERS"] !== "1";

/**
 * The seeded Owner's user id, passed in by `scripts/e2e-local.sh` (and by CI) so the admin dev
 * server knows which account is allowed on the platform plane.
 *
 * Unset in a vanilla `pnpm test:e2e` run: the platform console specs will still start, sign in,
 * and reach the console, but the console gate will refuse them with "Not a platform administrator"
 * unless the developer exports `PLATFORM_ADMIN_USER_IDS` themselves. The auth-gate and sign-in
 * specs (which run unauthenticated) are unaffected either way.
 */
const PLATFORM_ADMIN_USER_IDS = process.env["PLATFORM_ADMIN_USER_IDS"] ?? "";

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
    // ── Operator app (apps/web) ───────────────────────────────────────────────────────────────
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
      testIgnore: [
        /auth\.setup\.ts/,
        /sign-in\.spec\.ts/,
        // Platform console specs (and their setup) run under their own projects below; exclude
        // every platform-* file here so none of them run a second time (with the wrong baseURL
        // and the wrong session) under chromium — matches `platform-console-*` and
        // `platform-auth.setup.ts` alike, so a differently-ordered platform spec name can't slip
        // through the way `platform-tenants-console.spec.ts` did.
        /platform-/,
      ],
    },

    // ── Platform console (apps/admin) ─────────────────────────────────────────────────────────
    //
    // Three projects mirror the operator app's three: an unauthenticated project for the sign-in
    // and auth-gate specs, a setup project that signs in once and saves the platform session, and
    // an authenticated project for all other console specs.
    //
    // `baseURL` is deliberately NOT set for these projects — the admin dev server is on a
    // different port from the operator app and every spec constructs its own ADMIN_BASE_URL from
    // `process.env["ADMIN_PORT"]`. Setting `baseURL` here would only cause confusion.
    {
      name: "platform-console-unauthenticated",
      use: { ...devices["Desktop Chrome"] },
      // Auth spec runs unauthenticated — it covers sign-in, bad creds, auth gates, refusal, sign-out.
      testMatch: /platform-console-auth\.spec\.ts/,
    },
    {
      name: "platform-auth-setup",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /platform-auth\.setup\.ts/,
    },
    {
      name: "platform-console",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/platform.json",
      },
      dependencies: ["platform-auth-setup"],
      // All other platform-console-*.spec.ts run authenticated.
      testMatch: /platform-console-(?!auth).*\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: "pnpm dev:api",
      url: "http://localhost:3004/health",
      // Without an apex, host-based tenant resolution never matches and every public
      // request-access call is a 404 — production always has one set.
      env: { TENANT_APEX_DOMAIN: "localhost" },
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
      env: { E2E_SIGNIN_RATE_MAX: "100", TENANT_APEX_DOMAIN: "localhost" },
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
      url: `http://localhost:${ADMIN_PORT}/sign-in`,
      reuseExistingServer: REUSE_SERVERS,
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        PLATFORM_API_URL: "http://localhost:3004",
        // The platform auth instance has its own rate limiter (3 sign-in attempts per window).
        // The E2E suite signs in during setup and then again in the sign-in spec, so we raise it
        // the same way the operator app's limiter is raised — via an env var only present here.
        E2E_SIGNIN_RATE_MAX: "100",
        // Forwarded from the shell that launched Playwright (set by e2e-local.sh / CI). Unset
        // locally unless the developer exports it — the sign-in/auth-gate specs still pass, but
        // the authenticated console specs will be refused by the platform gate.
        ...(PLATFORM_ADMIN_USER_IDS ? { PLATFORM_ADMIN_USER_IDS } : {}),
      },
    },
  ],
});
