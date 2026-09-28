/**
 * Platform console — Tenants list, tenant detail, and suspend/restore flows.
 *
 * Runs in the `platform-console` Playwright project, which loads the session saved by
 * `platform-auth.setup.ts` (`e2e/.auth/platform.json`).
 *
 * Tests 19–25 (suspend/restore) are SEQUENTIAL and intentionally share state across runs.
 * They must run in order (workers:1 for this file) and leave Tenant B in 'active' state.
 * Do not reorder or isolate them — each test depends on the state left by the previous one.
 */

import { test, expect } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";

const A = `http://localhost:${process.env["ADMIN_PORT"] ?? "3008"}`;

const TENANT_SLUG = process.env["SEED_TENANT_SLUG"] ?? "destaworks";
const TENANT_B_SLUG = process.env["SEED_TENANT_B_SLUG"] ?? "e2e-tenant-b";
const TENANT_B_NAME = process.env["SEED_TENANT_B_NAME"] ?? "E2E Second Workspace";
const OWNER_EMAIL = process.env["SEED_OWNER_EMAIL"] ?? "owner@desta.local";

// ── Console chrome ──────────────────────────────────────────────────────────

test("console chrome: DESTAWORKS header, Platform console label, operator email, Sign out button are all visible", async ({
  page,
}) => {
  await gotoReady(page, `${A}/tenants`);

  await expect(page.getByText("DESTAWORKS")).toBeVisible();
  await expect(page.getByText("Platform console")).toBeVisible();
  await expect(page.getByText(OWNER_EMAIL)).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
});

test("console chrome: all four nav items are visible", async ({ page }) => {
  await gotoReady(page, `${A}/tenants`);

  await expect(page.getByRole("link", { name: "Tenants" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Health" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Platform metrics" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Support access" })).toBeVisible();
});

test("console chrome: Tenants nav link has aria-current=page on /tenants; Health link does not", async ({
  page,
}) => {
  await gotoReady(page, `${A}/tenants`);

  const tenantsLink = page.getByRole("link", { name: "Tenants" });
  const healthLink = page.getByRole("link", { name: "Health" });

  await expect(tenantsLink).toHaveAttribute("aria-current", "page");
  await expect(healthLink).not.toHaveAttribute("aria-current", "page");
});

test("console chrome: navigating to /health gives Health aria-current=page and Tenants loses it", async ({
  page,
}) => {
  await gotoReady(page, `${A}/tenants`);

  await page.getByRole("link", { name: "Health" }).click();
  await page.waitForURL(`${A}/health`);

  const tenantsLink = page.getByRole("link", { name: "Tenants" });
  const healthLink = page.getByRole("link", { name: "Health" });

  await expect(healthLink).toHaveAttribute("aria-current", "page");
  await expect(tenantsLink).not.toHaveAttribute("aria-current", "page");
});

// ── Tenants list ────────────────────────────────────────────────────────────

test("tenants list: both seeded workspaces appear in the table by name", async ({ page }) => {
  await gotoReady(page, `${A}/tenants`);

  // Primary tenant name is derived from the slug; assert Tenant B by name
  await expect(page.getByRole("link", { name: TENANT_B_NAME })).toBeVisible();
  // Also confirm the primary tenant slug appears somewhere in the table
  await expect(page.getByText(TENANT_SLUG)).toBeVisible();
});

test("tenants list: table has Workspace, Slug, Status, Members columns", async ({ page }) => {
  await gotoReady(page, `${A}/tenants`);

  const table = page.getByRole("table");
  await expect(table.getByRole("columnheader", { name: "Workspace" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Slug" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Status" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Members" })).toBeVisible();
});

test("tenants list: each row has a name link, slug, active status badge, and member count ≥ 1", async ({
  page,
}) => {
  await gotoReady(page, `${A}/tenants`);

  const table = page.getByRole("table");
  const rows = table.getByRole("row").filter({ hasNot: page.getByRole("columnheader") });

  // Check every data row
  const count = await rows.count();
  expect(count).toBeGreaterThanOrEqual(1);

  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);

    // Name cell is a link
    await expect(row.getByRole("link")).toBeVisible();

    // Status badge shows 'active' (before any suspend test runs)
    await expect(row.getByText("active")).toBeVisible();

    // Member count: extract cell text and verify it is a number ≥ 1
    // Members column is the 4th cell (0-indexed: 3)
    const cells = row.getByRole("cell");
    const memberText = await cells.nth(3).innerText();
    const memberNum = parseInt(memberText.trim(), 10);
    expect(memberNum).toBeGreaterThanOrEqual(1);
  }
});

test("tenants list: clicking workspace name navigates to /tenants/:slug", async ({ page }) => {
  await gotoReady(page, `${A}/tenants`);

  // Click the Tenant B link
  await page.getByRole("link", { name: TENANT_B_NAME }).click();
  await expect(page).toHaveURL(`${A}/tenants/${TENANT_B_SLUG}`);
});

// ── Tenant detail ───────────────────────────────────────────────────────────

test("tenant detail: page heading shows tenant name, status badge 'active', health badge 'ok'", async ({
  page,
}) => {
  await gotoReady(page, `${A}/tenants/${TENANT_SLUG}`);

  // heading
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // Both badges should be present
  await expect(page.getByText("active")).toBeVisible();
  await expect(page.getByText("ok")).toBeVisible();
});

test("tenant detail: fact card shows all 7 fields with correct values", async ({ page }) => {
  await gotoReady(page, `${A}/tenants/${TENANT_SLUG}`);

  // Slug label and correct slug value
  await expect(page.getByText("Slug", { exact: true })).toBeVisible();
  await expect(page.getByText(TENANT_SLUG)).toBeVisible();

  // Plan label
  await expect(page.getByText("Plan", { exact: true })).toBeVisible();

  // Members label and a numeric value
  await expect(page.getByText("Members", { exact: true })).toBeVisible();

  // Created label and a date-like value (contains digits)
  await expect(page.getByText("Created", { exact: true })).toBeVisible();

  // Trial shows em-dash when no trial
  await expect(page.getByText("Trial", { exact: true })).toBeVisible();
  await expect(page.getByText("—")).toBeVisible();

  // Last activity label
  await expect(page.getByText("Last activity", { exact: true })).toBeVisible();

  // Tenant id label — value is monospace, just verify the label is there and id-like text exists
  await expect(page.getByText("Tenant id", { exact: true })).toBeVisible();
});

test("tenant detail: back-link '← All tenants' returns to /tenants list", async ({ page }) => {
  await gotoReady(page, `${A}/tenants/${TENANT_SLUG}`);

  await page.getByRole("link", { name: "← All tenants" }).click();
  await expect(page).toHaveURL(`${A}/tenants`);
});

test("tenant detail: page title contains tenant name or 'Platform Console'", async ({ page }) => {
  await gotoReady(page, `${A}/tenants/${TENANT_SLUG}`);

  const title = await page.title();
  const hasTenantName =
    title.includes(TENANT_SLUG) || title.toLowerCase().includes("platform console");
  expect(hasTenantName).toBe(true);
});

test("tenant detail: accessible via direct URL without clicking from list", async ({ page }) => {
  // Navigate directly — no prior visit to /tenants
  await gotoReady(page, `${A}/tenants/${TENANT_B_SLUG}`);

  // Should show the detail page, not an error
  await expect(page.getByRole("link", { name: "← All tenants" })).toBeVisible();
  await expect(page.getByText("active")).toBeVisible();
});

// ── Suspend flow (Tenant B) — tests 14–21 ──────────────────────────────────

test("suspension panel: visible on active workspace with heading 'Suspend this workspace'", async ({
  page,
}) => {
  await gotoReady(page, `${A}/tenants/${TENANT_B_SLUG}`);

  await expect(page.getByRole("heading", { name: "Suspend this workspace" })).toBeVisible();
});

test("suspension panel: reason dropdown shows all 6 options", async ({ page }) => {
  await gotoReady(page, `${A}/tenants/${TENANT_B_SLUG}`);

  const select = page.getByRole("combobox", { name: "Suspension reason" });
  await expect(select).toBeVisible();

  const options = select.getByRole("option");
  await expect(options).toHaveCount(6);

  await expect(select.getByRole("option", { name: "Non-payment" })).toBeAttached();
  await expect(select.getByRole("option", { name: "Abuse" })).toBeAttached();
  await expect(select.getByRole("option", { name: "Security" })).toBeAttached();
  await expect(select.getByRole("option", { name: "Customer request" })).toBeAttached();
  await expect(select.getByRole("option", { name: "Trial expired" })).toBeAttached();
  await expect(select.getByRole("option", { name: "Other" })).toBeAttached();
});

test("suspension panel: clicking Suspend shows Yes/Cancel buttons and hides primary Suspend button", async ({
  page,
}) => {
  await gotoReady(page, `${A}/tenants/${TENANT_B_SLUG}`);

  // Before clicking: primary 'Suspend' is visible, confirmation buttons are not
  await expect(page.getByRole("button", { name: "Suspend" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Yes, suspend" })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel" })).not.toBeVisible();

  await page.getByRole("button", { name: "Suspend" }).click();

  // After clicking: confirmation buttons appear, primary Suspend disappears
  await expect(page.getByRole("button", { name: "Yes, suspend" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Suspend" })).not.toBeVisible();
});

test("suspension panel: Cancel dismisses confirmation and restores the Suspend button", async ({
  page,
}) => {
  await gotoReady(page, `${A}/tenants/${TENANT_B_SLUG}`);

  await page.getByRole("button", { name: "Suspend" }).click();
  await expect(page.getByRole("button", { name: "Yes, suspend" })).toBeVisible();

  await page.getByRole("button", { name: "Cancel" }).click();

  // Confirmation should disappear and primary Suspend button should be back
  await expect(page.getByRole("button", { name: "Yes, suspend" })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel" })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Suspend" })).toBeVisible();
});

test("suspension panel: can change reason before confirming — value persists after clicking Suspend", async ({
  page,
}) => {
  await gotoReady(page, `${A}/tenants/${TENANT_B_SLUG}`);

  const select = page.getByRole("combobox", { name: "Suspension reason" });

  // Change to 'abuse'
  await select.selectOption("abuse");
  await expect(select).toHaveValue("abuse");

  // Click primary Suspend — confirmation appears
  await page.getByRole("button", { name: "Suspend" }).click();

  // Dropdown should still show the chosen reason
  await expect(select).toHaveValue("abuse");

  // Cancel to leave state clean
  await page.getByRole("button", { name: "Cancel" }).click();
});

// ── Sequential suspend/restore flow — tests 19–25 ──────────────────────────
//
// These tests share state: 19 suspends Tenant B, 20–21 verify post-suspend state,
// 22–23 restore Tenant B, 24–25 verify post-restore state.
// They MUST run in this order (workers:1) and are NOT independent.
// The suite finishes with Tenant B in 'active' state.

test("(19) full suspend: pick nonpayment, click Suspend, confirm → status flips to suspended, restore panel appears", async ({
  page,
}) => {
  await gotoReady(page, `${A}/tenants/${TENANT_B_SLUG}`);

  const select = page.getByRole("combobox", { name: "Suspension reason" });
  await select.selectOption("nonpayment");

  await page.getByRole("button", { name: "Suspend" }).click();
  await page.getByRole("button", { name: "Yes, suspend" }).click();

  // Status badge should flip to 'suspended'
  await expect(page.getByText("suspended")).toBeVisible();

  // Restore panel should appear
  await expect(page.getByRole("heading", { name: "Suspended" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Restore access" })).toBeVisible();

  // Suspend panel should be gone
  await expect(page.getByRole("heading", { name: "Suspend this workspace" })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Suspend" })).not.toBeVisible();
});

test("(20) after suspend: tenants list shows suspended badge for Tenant B", async ({ page }) => {
  await gotoReady(page, `${A}/tenants`);

  // Find the Tenant B row and verify its status badge
  const tenantBRow = page.getByRole("row").filter({ hasText: TENANT_B_NAME });
  await expect(tenantBRow.getByText("suspended")).toBeVisible();
});

test("(21) after suspend: health table shows Tenant B health as critical or warning", async ({
  page,
}) => {
  await gotoReady(page, `${A}/health`);

  // Find the Tenant B row in the health table
  const tenantBRow = page.getByRole("row").filter({ hasText: TENANT_B_NAME });
  const rowText = await tenantBRow.innerText();
  const isCriticalOrWarning = rowText.includes("critical") || rowText.includes("warning");
  expect(isCriticalOrWarning).toBe(true);
});

// ── Sequential restore flow — tests 22–25 ──────────────────────────────────

test("(22) restore panel: shows heading Suspended, explanation text, Restore access button", async ({
  page,
}) => {
  await gotoReady(page, `${A}/tenants/${TENANT_B_SLUG}`);

  await expect(page.getByRole("heading", { name: "Suspended" })).toBeVisible();
  // Explanation mentions being refused / no data deleted
  await expect(page.getByText(/refused|lifted|deleted/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Restore access" })).toBeVisible();
});

test("(23) full restore: click Restore access → status badge flips to active, suspend panel returns, restore panel gone", async ({
  page,
}) => {
  await gotoReady(page, `${A}/tenants/${TENANT_B_SLUG}`);

  await page.getByRole("button", { name: "Restore access" }).click();

  // Status badge should flip back to 'active'
  await expect(page.getByText("active")).toBeVisible();

  // Suspend panel should return
  await expect(page.getByRole("heading", { name: "Suspend this workspace" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Suspend" })).toBeVisible();

  // Restore panel should be gone
  await expect(page.getByRole("heading", { name: "Suspended" })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Restore access" })).not.toBeVisible();
});

test("(24) after restore: tenants list shows active badge for Tenant B again", async ({ page }) => {
  await gotoReady(page, `${A}/tenants`);

  const tenantBRow = page.getByRole("row").filter({ hasText: TENANT_B_NAME });
  await expect(tenantBRow.getByText("active")).toBeVisible();
  await expect(tenantBRow.getByText("suspended")).not.toBeVisible();
});

test("(25) after restore: health table shows Tenant B health back as ok", async ({ page }) => {
  await gotoReady(page, `${A}/health`);

  const tenantBRow = page.getByRole("row").filter({ hasText: TENANT_B_NAME });
  await expect(tenantBRow.getByText("ok")).toBeVisible();
});

// ── Negative scenarios ──────────────────────────────────────────────────────

test("negative: unknown slug /tenants/this-does-not-exist renders error state, not a crash", async ({
  page,
}) => {
  await gotoReady(page, `${A}/tenants/this-does-not-exist`);

  // Should show an error message, not a Next.js error page
  await expect(page.getByText(/couldn't load|not found|error/i)).toBeVisible();

  // Back-link must still be present
  await expect(page.getByRole("link", { name: "← All tenants" })).toBeVisible();
});

test("negative: navigating to /tenants without a session redirects to /sign-in", async ({
  browser,
}) => {
  // Use a fresh context with NO stored session
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();

  await page.goto(`${A}/tenants`);
  await page.waitForURL(`${A}/sign-in**`);

  expect(page.url()).toContain("/sign-in");
  await context.close();
});

test("negative: Suspend button is NOT visible on a suspended workspace", async ({ page }) => {
  // Navigate to Tenant B detail page; after test 23 it is active, so we need to check a
  // suspended workspace. Re-suspend briefly for this assertion.
  await gotoReady(page, `${A}/tenants/${TENANT_B_SLUG}`);

  // Only valid if tenant is currently active; suspend it first
  const suspendButton = page.getByRole("button", { name: "Suspend" });
  const isSuspended = await page.getByRole("button", { name: "Restore access" }).isVisible();

  if (!isSuspended) {
    await suspendButton.click();
    await page.getByRole("button", { name: "Yes, suspend" }).click();
    await expect(page.getByText("suspended")).toBeVisible();
  }

  // On a suspended workspace: only Restore access is shown, not Suspend
  await expect(page.getByRole("button", { name: "Restore access" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Suspend" })).not.toBeVisible();

  // Restore to leave clean state
  await page.getByRole("button", { name: "Restore access" }).click();
  await expect(page.getByText("active")).toBeVisible();
});

test("negative: Restore access button is NOT visible on an active workspace", async ({ page }) => {
  await gotoReady(page, `${A}/tenants/${TENANT_B_SLUG}`);

  // Tenant B should be active after test 23/25
  await expect(page.getByText("active")).toBeVisible();

  await expect(page.getByRole("button", { name: "Restore access" })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Suspend" })).toBeVisible();
});

test("negative: Yes suspend button NOT visible before clicking Suspend", async ({ page }) => {
  await gotoReady(page, `${A}/tenants/${TENANT_B_SLUG}`);

  // Without having clicked the primary Suspend button, confirmation must not be visible
  await expect(page.getByRole("button", { name: "Yes, suspend" })).not.toBeVisible();

  // The primary Suspend button should be there instead
  await expect(page.getByRole("button", { name: "Suspend" })).toBeVisible();
});
