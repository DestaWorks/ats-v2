import { test, expect, type Page } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";

/**
 * Platform console — authentication: every positive and negative scenario.
 *
 * Runs in `platform-console-unauthenticated` (NO storageState).
 *
 * Positive scenarios covered:
 *   1.  Sign-in page renders: branding, heading, fields, button, no initial error
 *   2.  Correct credentials → /tenants, Tenants heading visible
 *   3.  Successful sign-in sets the desta-platform session cookie (HttpOnly)
 *   4.  Keyboard-only form submission lands on /tenants
 *   5.  Already signed-in → /sign-in redirects to /tenants
 *   6.  Sign-out button visible in the console header chrome
 *   7.  Sign-out → /sign-in, sign-in form rendered again
 *   8.  Sign-out clears the desta-platform session cookie
 *   9.  After sign-out, every protected route redirects to /sign-in
 *   10. Operator-app sign-in does NOT grant console access
 *   11. Console sign-out does NOT destroy the operator-app session cookie
 *
 * Negative scenarios covered:
 *   12. Wrong password → 'Sign in failed', no field enumeration
 *   13. Unknown email → same generic error, no account-existence hint
 *   14. Empty email + filled password → HTML5 required, no submission
 *   15. Filled email + empty password → HTML5 required, no submission
 *   16. Both fields empty → not submitted
 *   17. Malformed email (no @) → browser validation, not submitted
 *   18. SQL-injection-looking email → generic error, no crash
 *   19. XSS-looking input → title unchanged, generic error shown
 *   20. Non-platform user → 'Not a platform administrator', explanation, no nav
 *   21. Non-platform user: every console route renders the refusal, not a 404 or blank
 *   22. Root / without session → redirects to /sign-in
 *   23. Deep URL /tenants/:slug without session → redirects to /sign-in
 */

const A = `http://localhost:${process.env["ADMIN_PORT"] ?? "3008"}`;
const WEB = "http://localhost:3007";
const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3004";

const EMAIL = process.env["SEED_OWNER_EMAIL"] ?? "owner@desta.local";
const PASSWORD = process.env["SEED_OWNER_PASSWORD"] ?? "ChangeMe123!";

// ── helpers ──────────────────────────────────────────────────────────────────

/** Signs in as a platform admin (correct credentials) and waits for /tenants. */
async function signInAsPlatformAdmin(page: Page): Promise<void> {
  await gotoReady(page, `${A}/sign-in`);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(`${A}/tenants`);
}

/** Signs in as the seeded Owner to the OPERATOR APP and returns the page. */
async function signInToOperatorApp(page: Page): Promise<void> {
  await gotoReady(page, `${WEB}/sign-in`);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL(/\/(dashboard|choose-workspace)/);
}

/**
 * Creates a fresh user via the operator API, suitable for console-refusal tests.
 * Uses the Owner session in the given context (which must already be signed in to
 * the operator app before calling this).
 */
async function createNonPlatformUser(page: Page): Promise<{ email: string; password: string }> {
  const tenantSlug = process.env["SEED_TENANT_SLUG"] ?? "destaworks";
  await page.request.post(`${API}/tenants/switch`, { data: { tenant: tenantSlug } });

  const rolesRes = await page.request.get(`${API}/tenants/roles`);
  const { roles } = (await rolesRes.json()) as { roles: { id: string; name: string }[] };
  const roleId = roles.find((r) => r.name === "Associate")?.id ?? roles[0]!.id;

  const email = `e2e-refused-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = "NonPlatform123!";
  await page.request.post(`${API}/admin/users`, {
    data: { name: "E2E Refused User", email, roleId, password },
  });

  return { email, password };
}

// ── 1. Sign-in page rendering ─────────────────────────────────────────────────

test("sign-in page renders DestaWorks Platform branding, 'Operator sign in' heading, email and password fields, submit button, and no error on fresh load", async ({
  page,
}) => {
  await gotoReady(page, `${A}/sign-in`);

  await expect(page.getByText("DestaWorks Platform")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Operator sign in" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  // No error should be present on a clean first load.
  await expect(page.getByRole("alert")).not.toBeVisible();
});

// ── 2. Successful sign-in → /tenants ─────────────────────────────────────────

test("correct credentials redirect to /tenants and the Tenants heading is visible", async ({
  page,
}) => {
  await gotoReady(page, `${A}/sign-in`);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(`${A}/tenants`);
  await expect(page.getByRole("heading", { name: "Tenants" })).toBeVisible();
});

// ── 3. Session cookie after sign-in ──────────────────────────────────────────

test("successful sign-in sets a desta-platform session cookie that is HttpOnly", async ({
  page,
  context,
}) => {
  await signInAsPlatformAdmin(page);

  const cookies = await context.cookies(`${A}`);
  const sessionCookie = cookies.find((c) => c.name.startsWith("desta-platform"));
  expect(sessionCookie, "desta-platform session cookie must exist after sign-in").toBeDefined();
  expect(sessionCookie?.httpOnly, "session cookie must be HttpOnly (not readable by JS)").toBe(
    true,
  );
});

// ── 4. Keyboard-only sign-in ──────────────────────────────────────────────────

test("keyboard-only sign-in: Tab between fields, Enter to submit, lands on /tenants", async ({
  page,
}) => {
  await gotoReady(page, `${A}/sign-in`);

  await page.getByLabel("Email").focus();
  await page.keyboard.type(EMAIL);
  await page.keyboard.press("Tab");
  await page.keyboard.type(PASSWORD);
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(`${A}/tenants`);
});

// ── 5. Already signed-in redirected away from /sign-in ────────────────────────

test("already signed-in user visiting /sign-in is redirected to /tenants and the form is not shown", async ({
  page,
}) => {
  await signInAsPlatformAdmin(page);
  await gotoReady(page, `${A}/sign-in`);

  await expect(page).toHaveURL(`${A}/tenants`);
  // The email input is a sign the sign-in form is rendered — it must not be visible.
  await expect(page.getByLabel("Email")).not.toBeVisible();
});

// ── 6. Sign-out button visible in console chrome ──────────────────────────────

test("sign-out button is visible in the console header after signing in", async ({ page }) => {
  await signInAsPlatformAdmin(page);

  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
});

// ── 7. Sign-out redirects to /sign-in with the form rendered ─────────────────

test("clicking sign-out redirects to /sign-in and the sign-in form is rendered again", async ({
  page,
}) => {
  await signInAsPlatformAdmin(page);

  await page.getByRole("button", { name: "Sign out" }).click();

  await expect(page).toHaveURL(`${A}/sign-in`);
  // The sign-in form must be rendered — not a blank page or error screen.
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
});

// ── 8. Sign-out clears the session cookie ────────────────────────────────────

test("sign-out clears the desta-platform session cookie", async ({ page, context }) => {
  await signInAsPlatformAdmin(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(`${A}/sign-in`);

  const cookies = await context.cookies(`${A}`);
  const platformCookie = cookies.find((c) => c.name.startsWith("desta-platform"));
  expect(platformCookie, "desta-platform cookie must be absent after sign-out").toBeUndefined();
});

// ── 9. After sign-out, every protected route redirects to /sign-in ────────────

test("after sign-out, /tenants redirects to /sign-in", async ({ page }) => {
  await signInAsPlatformAdmin(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(`${A}/sign-in`);

  await gotoReady(page, `${A}/tenants`);
  await expect(page).toHaveURL(`${A}/sign-in`);
});

test("after sign-out, /health redirects to /sign-in", async ({ page }) => {
  await signInAsPlatformAdmin(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(`${A}/sign-in`);

  await gotoReady(page, `${A}/health`);
  await expect(page).toHaveURL(`${A}/sign-in`);
});

test("after sign-out, /metrics redirects to /sign-in", async ({ page }) => {
  await signInAsPlatformAdmin(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(`${A}/sign-in`);

  await gotoReady(page, `${A}/metrics`);
  await expect(page).toHaveURL(`${A}/sign-in`);
});

test("after sign-out, /impersonation redirects to /sign-in", async ({ page }) => {
  await signInAsPlatformAdmin(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(`${A}/sign-in`);

  await gotoReady(page, `${A}/impersonation`);
  await expect(page).toHaveURL(`${A}/sign-in`);
});

// ── 10. Console session independent from operator-app session ─────────────────

test("operator-app sign-in does not grant console access: /tenants redirects to /sign-in", async ({
  browser,
}) => {
  // Sign into the OPERATOR APP — this sets the operator-app session cookie but NOT desta-platform.
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();

  await signInToOperatorApp(page);

  // Navigate to a console protected route — the console gate must still refuse.
  await gotoReady(page, `${A}/tenants`);
  await expect(page).toHaveURL(`${A}/sign-in`);
  // The console sign-in form must be present — not the operator-app's sign-in form.
  await expect(page.getByRole("heading", { name: "Operator sign in" })).toBeVisible();

  await ctx.close();
});

// ── 11. Console sign-out does not destroy the operator-app session ─────────────

test("console sign-out does not destroy the operator-app session cookie", async ({ browser }) => {
  // Step 1: Sign into the operator app in a separate context.
  const webCtx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const webPage = await webCtx.newPage();
  await signInToOperatorApp(webPage);

  // Capture the operator-app session cookie value before any console activity.
  const webCookiesBefore = await webCtx.cookies(WEB);
  const operatorCookieBefore = webCookiesBefore.find((c) => !c.name.startsWith("desta-platform"));
  expect(
    operatorCookieBefore,
    "operator-app session cookie must exist before console sign-out",
  ).toBeDefined();

  // Step 2: Sign into the console and sign out in a different context.
  const consoleCtx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const consolePage = await consoleCtx.newPage();
  await signInAsPlatformAdmin(consolePage);
  await consolePage.getByRole("button", { name: "Sign out" }).click();
  await expect(consolePage).toHaveURL(`${A}/sign-in`);
  await consoleCtx.close();

  // Step 3: The operator-app session cookie must still be present and unchanged.
  const webCookiesAfter = await webCtx.cookies(WEB);
  const operatorCookieAfter = webCookiesAfter.find((c) => c.name === operatorCookieBefore!.name);
  expect(
    operatorCookieAfter,
    "operator-app session cookie must still exist after console sign-out",
  ).toBeDefined();
  expect(operatorCookieAfter?.value).toBe(operatorCookieBefore!.value);

  await webCtx.close();
});

// ── 12. Wrong password shows generic error without field enumeration ───────────

test("wrong password stays on /sign-in, shows 'Sign in failed', does not reveal which field was wrong", async ({
  page,
}) => {
  await gotoReady(page, `${A}/sign-in`);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill("definitely-wrong-99");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(`${A}/sign-in`);
  await expect(page.getByRole("alert")).toContainText("Sign in failed");
  // Must NOT disclose which field failed — no enumeration.
  await expect(page.getByRole("alert")).not.toContainText(
    /wrong password|invalid password|no such|not found/i,
  );
});

// ── 13. Unknown email shows the same generic error ────────────────────────────

test("unknown email address shows the same 'Sign in failed' error with no account-existence hint", async ({
  page,
}) => {
  await gotoReady(page, `${A}/sign-in`);
  await page.getByLabel("Email").fill("nobody-at-all@example.com");
  await page.getByLabel("Password").fill("anything");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(`${A}/sign-in`);
  await expect(page.getByRole("alert")).toContainText("Sign in failed");
  // Must not hint that the account does not exist.
  await expect(page.getByRole("alert")).not.toContainText(
    /no such|not found|no account|doesn.t exist/i,
  );
});

// ── 14. Empty email + filled password → HTML5 required prevents submission ────

test("empty email with a filled password does not submit the form and shows no server error", async ({
  page,
}) => {
  await gotoReady(page, `${A}/sign-in`);
  // Leave email empty.
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Still on sign-in — form was not submitted.
  await expect(page).toHaveURL(`${A}/sign-in`);
  // No server-side error because the request never left the browser.
  await expect(page.getByRole("alert")).not.toBeVisible();
  // The email input must carry the `required` attribute.
  await expect(page.getByLabel("Email")).toHaveAttribute("required");
});

// ── 15. Filled email + empty password → HTML5 required prevents submission ────

test("filled email with an empty password does not submit the form and shows no server error", async ({
  page,
}) => {
  await gotoReady(page, `${A}/sign-in`);
  await page.getByLabel("Email").fill(EMAIL);
  // Leave password empty.
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(`${A}/sign-in`);
  await expect(page.getByRole("alert")).not.toBeVisible();
  await expect(page.getByLabel("Password")).toHaveAttribute("required");
});

// ── 16. Both fields empty → not submitted ─────────────────────────────────────

test("clicking submit with both fields empty does not submit the form", async ({ page }) => {
  await gotoReady(page, `${A}/sign-in`);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(`${A}/sign-in`);
  await expect(page.getByRole("alert")).not.toBeVisible();
});

// ── 17. Malformed email (no @) → browser validation prevents submission ────────

test("malformed email without an @ sign does not submit the form", async ({ page }) => {
  await gotoReady(page, `${A}/sign-in`);
  await page.getByLabel("Email").fill("notanemail");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(`${A}/sign-in`);
  await expect(page.getByRole("alert")).not.toBeVisible();
});

// ── 18. SQL-injection-looking email → generic error, no crash ─────────────────

test("SQL-injection-looking email is treated as a failed login with a generic error and does not crash the server", async ({
  page,
}) => {
  await gotoReady(page, `${A}/sign-in`);
  // This is a valid email per HTML5 (has an @) so browser validation passes.
  await page.getByLabel("Email").fill("' OR 1=1; --@example.com");
  await page.getByLabel("Password").fill("anything");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(`${A}/sign-in`);
  // Must show a generic error, not a stack trace or 500.
  await expect(page.getByRole("alert")).toContainText("Sign in failed");
});

// ── 19. XSS-looking input → not executed, generic error ──────────────────────

test("XSS-looking email is rendered as plain text and not executed — page title stays unchanged", async ({
  page,
}) => {
  await gotoReady(page, `${A}/sign-in`);
  const xssInput = `<script>document.title='HACKED'</script>@example.com`;
  await page.getByLabel("Email").fill(xssInput);
  await page.getByLabel("Password").fill("anything");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(`${A}/sign-in`);
  // If the script ran, the title would have changed — it must not.
  const title = await page.title();
  expect(title).not.toBe("HACKED");
  // Error is shown — treated as a failed sign-in attempt.
  await expect(page.getByRole("alert")).toContainText("Sign in failed");
});

// ── 20 & 21. Non-platform user: refusal screen ────────────────────────────────

/**
 * Creates a fresh tenant user via the operator API, then signs into the CONSOLE as that user.
 * Because the user's id is not in PLATFORM_ADMIN_USER_IDS, the console layout should serve the
 * "Not a platform administrator" refusal rather than the console contents.
 *
 * Pattern: open a clean context, sign into the operator app as Owner, call the admin API to
 * create the user, close that context, then open another clean context and sign into the console.
 */
test("non-platform user sees 'Not a platform administrator' with explanation text and no nav is rendered", async ({
  browser,
}) => {
  // ── Step 1: create the account via the operator API ──────────────────────────
  const ownerCtx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const ownerPage = await ownerCtx.newPage();
  await signInToOperatorApp(ownerPage);
  const { email, password } = await createNonPlatformUser(ownerPage);
  await ownerCtx.close();

  // ── Step 2: sign into the CONSOLE as the non-platform user ───────────────────
  const consoleCtx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const consolePage = await consoleCtx.newPage();

  await gotoReady(consolePage, `${A}/sign-in`);
  await consolePage.getByLabel("Email").fill(email);
  await consolePage.getByLabel("Password").fill(password);
  await consolePage.getByRole("button", { name: "Sign in" }).click();

  // ── Assert the refusal screen ─────────────────────────────────────────────────
  // Sign-in itself succeeds (the platform auth instance accepts any valid user), but the console
  // layout renders the refusal for anyone not on PLATFORM_ADMIN_USER_IDS.
  await expect(
    consolePage.getByRole("heading", { name: "Not a platform administrator" }),
  ).toBeVisible();
  // The explanation text must be visible.
  await expect(
    consolePage.getByText("This account is not on the platform administrator list"),
  ).toBeVisible();
  // The text references deployment configuration, not a role.
  await expect(consolePage.getByText("deployment configuration")).toBeVisible();

  // The sign-in form must NOT be shown — the user is signed in, just refused.
  await expect(consolePage.getByLabel("Email")).not.toBeVisible();

  // NO navigation must be rendered — the refusal is a dead end.
  await expect(consolePage.getByRole("navigation")).not.toBeVisible();
  // Individual nav links must not be reachable.
  for (const label of ["Tenants", "Health", "Platform metrics", "Support access"]) {
    await expect(consolePage.getByRole("link", { name: label })).not.toBeVisible();
  }

  await consoleCtx.close();
});

test("non-platform user sees the refusal on every console route — not a 404 or blank page", async ({
  browser,
}) => {
  // ── Step 1: create the account via the operator API ──────────────────────────
  const ownerCtx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const ownerPage = await ownerCtx.newPage();
  await signInToOperatorApp(ownerPage);
  const { email, password } = await createNonPlatformUser(ownerPage);
  await ownerCtx.close();

  // ── Step 2: sign into the CONSOLE ────────────────────────────────────────────
  const consoleCtx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const cp = await consoleCtx.newPage();

  await gotoReady(cp, `${A}/sign-in`);
  await cp.getByLabel("Email").fill(email);
  await cp.getByLabel("Password").fill(password);
  await cp.getByRole("button", { name: "Sign in" }).click();

  // Sign-in redirects to /tenants → layout renders the refusal there.
  await expect(cp.getByRole("heading", { name: "Not a platform administrator" })).toBeVisible();

  // Every other protected route must also render the refusal — not a 404 or blank.
  for (const path of ["/health", "/metrics", "/impersonation"]) {
    await gotoReady(cp, `${A}${path}`);
    await expect(
      cp.getByRole("heading", { name: "Not a platform administrator" }),
      `${path} must render the refusal, not a 404 or blank page`,
    ).toBeVisible();
  }

  await consoleCtx.close();
});

// ── 22. Root / without session → /sign-in ────────────────────────────────────

test("unauthenticated request to root / redirects to /sign-in", async ({ page }) => {
  await gotoReady(page, `${A}/`);
  await expect(page).toHaveURL(`${A}/sign-in`);
  // The sign-in form must be rendered.
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

// ── 23. Deep URL without session → /sign-in ──────────────────────────────────

test("unauthenticated request to a deep /tenants/:slug URL redirects to /sign-in", async ({
  page,
}) => {
  const slug = process.env["SEED_TENANT_B_SLUG"] ?? "e2e-tenant-b";
  await gotoReady(page, `${A}/tenants/${slug}`);
  await expect(page).toHaveURL(`${A}/sign-in`);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

// ── unauthenticated gate for every protected route (belt-and-suspenders) ──────

test("unauthenticated request to /tenants redirects to /sign-in", async ({ page }) => {
  await gotoReady(page, `${A}/tenants`);
  await expect(page).toHaveURL(`${A}/sign-in`);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("unauthenticated request to /health redirects to /sign-in", async ({ page }) => {
  await gotoReady(page, `${A}/health`);
  await expect(page).toHaveURL(`${A}/sign-in`);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("unauthenticated request to /metrics redirects to /sign-in", async ({ page }) => {
  await gotoReady(page, `${A}/metrics`);
  await expect(page).toHaveURL(`${A}/sign-in`);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("unauthenticated request to /impersonation redirects to /sign-in", async ({ page }) => {
  await gotoReady(page, `${A}/impersonation`);
  await expect(page).toHaveURL(`${A}/sign-in`);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});
