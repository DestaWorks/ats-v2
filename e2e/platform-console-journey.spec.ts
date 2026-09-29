import { test, expect } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";

/**
 * One operator session across the whole console, alternating a working step with a refused one,
 * in the order an operator actually hits them: wrong password → sign in → open a tenant → try to
 * restore one that isn't suspended → suspend it → try to suspend it again → watch Health and
 * Metrics pick up the change → hit an unknown workspace on Support access → read the real one →
 * restore → sign out → get refused at the door.
 *
 * Every step here is covered in isolation elsewhere (platform-console-auth/tenants/health-metrics/
 * support-access.spec.ts). What only this spec can catch is state that does not survive a
 * crossing — a suspend the health page never picks up, or a session a sign-out doesn't actually
 * end — and it is the one place a refusal sits inside a session that also does real work, rather
 * than in a suite of refusals run on their own.
 *
 * Runs its own fresh, unauthenticated browser context (ignores the `platform-console` project's
 * default storageState) so it can start at the wrong-password step before ever being signed in —
 * same pattern platform-console-auth.spec.ts uses for its non-platform-user tests.
 *
 * Self-contained: suspends Tenant B and restores it again within this one test, so it leaves no
 * state for platform-console-tenants.spec.ts's own sequential suspend/restore tests to trip on,
 * whichever file runs first.
 */

const A = `http://localhost:${process.env["ADMIN_PORT"] ?? "3008"}`;

const EMAIL = process.env["SEED_OWNER_EMAIL"] ?? "owner@desta.local";
const PASSWORD = process.env["SEED_OWNER_PASSWORD"] ?? "ChangeMe123!";
const TENANT_B_SLUG = process.env["SEED_TENANT_B_SLUG"] ?? "e2e-tenant-b";
const TENANT_B_NAME = process.env["SEED_TENANT_B_NAME"] ?? "E2E Second Workspace";

test("one session: wrong password, sign in, suspend, cross-page effects, unknown workspace, restore, sign out, refused re-entry", async ({
  browser,
}) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();

  // 1. Wrong password first — refused, generic error, still on the sign-in form.
  await gotoReady(page, `${A}/sign-in`);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill("definitely-wrong-99");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(`${A}/sign-in`);
  await expect(page.getByRole("alert")).toContainText("Sign in failed");

  // 2. Correct credentials — in, chrome renders.
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(`${A}/tenants`);
  await expect(page.getByRole("heading", { name: "Tenants" })).toBeVisible();

  // 3. Into Tenant B's detail page.
  await gotoReady(page, `${A}/tenants/${TENANT_B_SLUG}`);
  await expect(page.getByRole("heading", { name: TENANT_B_NAME })).toBeVisible();

  // 4. Refused: nothing to restore on an active workspace.
  await expect(page.getByRole("button", { name: "Restore access" })).not.toBeVisible();

  // 5. Suspend it for real.
  await page.getByRole("button", { name: "Suspend" }).click();
  await page.getByRole("button", { name: "Yes, suspend" }).click();
  await expect(page.getByText("suspended")).toBeVisible();
  await expect(page.getByRole("button", { name: "Restore access" })).toBeVisible();

  // 6. Refused: a suspended workspace offers no Suspend button.
  await expect(page.getByRole("button", { name: "Suspend" })).not.toBeVisible();

  // 7. Cross-page effect: Health picks up the suspension.
  await gotoReady(page, `${A}/health`);
  const healthRow = page.getByRole("row").filter({ hasText: TENANT_B_NAME });
  const healthRowText = await healthRow.innerText();
  expect(healthRowText.includes("critical") || healthRowText.includes("warning")).toBe(true);

  // 8. Cross-page effect: Metrics' Status panel gains a 'suspended' bucket.
  await gotoReady(page, `${A}/metrics`);
  const statusPanel = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Status", level: 2 }) });
  await expect(statusPanel.getByText("suspended")).toBeVisible();

  // 9. Refused: an unknown workspace on Support access errors, doesn't crash.
  await gotoReady(page, `${A}/impersonation?slug=this-does-not-exist`);
  await expect(page.getByRole("heading", { name: "Support access" })).toBeVisible();
  await expect(page.getByText(/Couldn't read/i)).toBeVisible();

  // 10. The real workspace reads fine — table or the honest empty state, never a crash.
  await gotoReady(page, `${A}/impersonation?slug=${TENANT_B_SLUG}`);
  const tableVisible = await page
    .getByRole("table", { name: "Support activity" })
    .isVisible()
    .catch(() => false);
  const emptyVisible = await page
    .getByText("Nothing recorded")
    .isVisible()
    .catch(() => false);
  expect(tableVisible || emptyVisible).toBe(true);

  // 11. Restore Tenant B — status flips back, suspend panel returns.
  await gotoReady(page, `${A}/tenants/${TENANT_B_SLUG}`);
  await page.getByRole("button", { name: "Restore access" }).click();
  await expect(page.getByText("active")).toBeVisible();
  await expect(page.getByRole("button", { name: "Suspend" })).toBeVisible();

  // 12. Sign out — back at the sign-in form.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(`${A}/sign-in`);

  // 13. Refused: deep-linking back in while signed out lands on /sign-in, not the console.
  await gotoReady(page, `${A}/tenants`);
  await expect(page).toHaveURL(`${A}/sign-in`);

  await context.close();
});
