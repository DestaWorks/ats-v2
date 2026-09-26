import { test, expect } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";

const AUTH_WEB_BASE = "http://localhost:3007";

test("sends the root path on to the dashboard", async ({ page }) => {
  await gotoReady(page, "/");

  await expect(page).toHaveURL(/\/dashboard/);
});

test("renders the forgot-password form", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();

  await gotoReady(page, "/forgot-password");

  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send Reset Link" })).toBeVisible();
  await context.close();
});

test("answers a reset request the same way whether or not the account exists", async ({
  browser,
}) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const known = process.env["SEED_OWNER_EMAIL"] ?? "owner@e2e.local";

  const forKnown = await context.request.post(`${AUTH_WEB_BASE}/api/auth/request-password-reset`, {
    data: { email: known, redirectTo: `${AUTH_WEB_BASE}/reset-password` },
    headers: { origin: AUTH_WEB_BASE },
  });
  const forUnknown = await context.request.post(
    `${AUTH_WEB_BASE}/api/auth/request-password-reset`,
    {
      data: {
        email: `e2e-no-such-account-${Date.now()}@example.com`,
        redirectTo: `${AUTH_WEB_BASE}/reset-password`,
      },
      headers: { origin: AUTH_WEB_BASE },
    },
  );

  expect(forUnknown.status(), "an unknown address must not be distinguishable").toBe(
    forKnown.status(),
  );
  await context.close();
});

test("refuses a reset link with no token", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();

  await gotoReady(page, "/reset-password");

  await expect(page.getByText(/reset link is invalid or has expired/i)).toBeVisible();
  await expect(page.getByLabel("New password")).toHaveCount(0);
  await context.close();
});

test("refuses a reset link the server already rejected", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();

  await gotoReady(page, "/reset-password?error=INVALID_TOKEN");

  await expect(page.getByText(/reset link is invalid or has expired/i)).toBeVisible();
  await context.close();
});
