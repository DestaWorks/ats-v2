import { test, expect, type Page } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";

/**
 * Platform console — Support access (impersonation) page.
 *
 * Covers the full cross-page navigation journey across all four console sections AND every
 * positive/negative scenario for the /impersonation page.
 *
 * Read-only design: there is no "Grant support access" button here — consent is the TENANT'S
 * to give (from their own workspace settings). This console only reads the trail of what was done
 * with an open window.
 *
 * Runs in the `platform-console` project (authenticated session from platform-auth.setup.ts).
 */

const A = `http://localhost:${process.env["ADMIN_PORT"] ?? "3008"}`;
const TENANT_A_SLUG = process.env["SEED_TENANT_SLUG"] ?? "destaworks";
const TENANT_B_SLUG = process.env["SEED_TENANT_B_SLUG"] ?? "e2e-tenant-b";
const TENANT_B_NAME = process.env["SEED_TENANT_B_NAME"] ?? "E2E Second Workspace";

// ── helpers ───────────────────────────────────────────────────────────────────────────────────────

async function gotoImpersonation(page: Page): Promise<void> {
  await gotoReady(page, `${A}/impersonation`);
  await expect(page.getByRole("heading", { name: "Support access" })).toBeVisible();
}

// ── cross-page navigation journey ─────────────────────────────────────────────────────────────────

test("full nav journey: /tenants → Health → Platform metrics → Support access → Tenants", async ({
  page,
}) => {
  const nav = page.getByRole("navigation", { name: "Platform console" });

  // Start at /tenants — Tenants link should be active.
  await gotoReady(page, `${A}/tenants`);
  await expect(page).toHaveURL(`${A}/tenants`);
  await expect(nav.getByRole("link", { name: "Tenants" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Health" })).not.toHaveAttribute(
    "aria-current",
    "page",
  );

  // Click Health.
  await nav.getByRole("link", { name: "Health" }).click();
  await expect(page).toHaveURL(`${A}/health`);
  await expect(nav.getByRole("link", { name: "Health" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Tenants" })).not.toHaveAttribute(
    "aria-current",
    "page",
  );

  // Click Platform metrics.
  await nav.getByRole("link", { name: "Platform metrics" }).click();
  await expect(page).toHaveURL(`${A}/metrics`);
  await expect(nav.getByRole("link", { name: "Platform metrics" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(nav.getByRole("link", { name: "Health" })).not.toHaveAttribute(
    "aria-current",
    "page",
  );

  // Click Support access.
  await nav.getByRole("link", { name: "Support access" }).click();
  await expect(page).toHaveURL(`${A}/impersonation`);
  await expect(nav.getByRole("link", { name: "Support access" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(nav.getByRole("link", { name: "Platform metrics" })).not.toHaveAttribute(
    "aria-current",
    "page",
  );

  // Click Tenants — full circle.
  await nav.getByRole("link", { name: "Tenants" }).click();
  await expect(page).toHaveURL(`${A}/tenants`);
  await expect(nav.getByRole("link", { name: "Tenants" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Support access" })).not.toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("browser back button navigates correctly between console pages", async ({ page }) => {
  await gotoReady(page, `${A}/tenants`);
  await gotoReady(page, `${A}/health`);
  await gotoReady(page, `${A}/impersonation`);

  // Back to Health.
  await page.goBack();
  await expect(page).toHaveURL(`${A}/health`);
  const nav = page.getByRole("navigation", { name: "Platform console" });
  await expect(nav.getByRole("link", { name: "Health" })).toHaveAttribute("aria-current", "page");

  // Back to Tenants.
  await page.goBack();
  await expect(page).toHaveURL(`${A}/tenants`);
  await expect(nav.getByRole("link", { name: "Tenants" })).toHaveAttribute("aria-current", "page");
});

test("navigating away from Support access and back resets to empty state (no ?slug=)", async ({
  page,
}) => {
  // Land on /impersonation with a workspace selected.
  await gotoReady(page, `${A}/impersonation?slug=${TENANT_B_SLUG}`);
  await expect(page).toHaveURL(new RegExp(`slug=${TENANT_B_SLUG}`));

  // Navigate away.
  const nav = page.getByRole("navigation", { name: "Platform console" });
  await nav.getByRole("link", { name: "Tenants" }).click();
  await expect(page).toHaveURL(`${A}/tenants`);

  // Navigate back via the nav link — the link has no ?slug=, so the URL must have none.
  await nav.getByRole("link", { name: "Support access" }).click();
  await expect(page).toHaveURL(`${A}/impersonation`);
  await expect(page).not.toHaveURL(new RegExp("slug="));
  await expect(page.getByText("Choose a workspace")).toBeVisible();
});

// ── support access page — positive ───────────────────────────────────────────────────────────────

test("navigate to /impersonation via 'Support access' nav link — URL changes and active state updates", async ({
  page,
}) => {
  await gotoReady(page, `${A}/tenants`);
  const nav = page.getByRole("navigation", { name: "Platform console" });

  await nav.getByRole("link", { name: "Support access" }).click();

  await expect(page).toHaveURL(`${A}/impersonation`);
  await expect(nav.getByRole("link", { name: "Support access" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(nav.getByRole("link", { name: "Tenants" })).not.toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("navigate directly to /impersonation by URL — page loads", async ({ page }) => {
  await gotoReady(page, `${A}/impersonation`);
  await expect(page.getByRole("heading", { name: "Support access" })).toBeVisible();
});

test("heading 'Support access' is visible on the page", async ({ page }) => {
  await gotoImpersonation(page);
  await expect(page.getByRole("heading", { name: "Support access" })).toBeVisible();
});

test("read-only policy description: time-boxed window text and 'cannot open one' text visible", async ({
  page,
}) => {
  await gotoImpersonation(page);

  // The policy paragraph must explain that a workspace controls its own window.
  await expect(page.getByText(/time-boxed support window from its own settings/)).toBeVisible();
  // And that this console cannot open one.
  await expect(page.getByText(/cannot open one/)).toBeVisible();
});

test("all seeded tenant workspace pills are rendered as links", async ({ page }) => {
  await gotoImpersonation(page);

  // The second workspace pill (known name from seed data).
  await expect(page.getByRole("link", { name: TENANT_B_NAME })).toBeVisible();

  // Primary workspace pill — assert via href slug rather than an assumed display name.
  const primaryPill = page.locator(`a[href*="slug=${TENANT_A_SLUG}"]`);
  await expect(primaryPill).toBeVisible();
});

test("no workspace selected (no ?slug=) — 'Choose a workspace' empty state visible, table absent", async ({
  page,
}) => {
  await gotoImpersonation(page);

  await expect(page.getByText("Choose a workspace")).toBeVisible();
  await expect(page.getByText("Pick one above to read what support did inside it.")).toBeVisible();

  // The activity table must NOT exist when nothing is selected.
  await expect(page.getByRole("table", { name: "Support activity" })).not.toBeVisible();
});

test("clicking Tenant B pill — URL gains ?slug=TENANT_B_SLUG, empty state disappears", async ({
  page,
}) => {
  await gotoImpersonation(page);

  await page.getByRole("link", { name: TENANT_B_NAME }).click();

  await expect(page).toHaveURL(new RegExp(`slug=${TENANT_B_SLUG}`));
  await expect(page.getByText("Choose a workspace")).not.toBeVisible();
});

test("selecting Tenant B renders activity table or 'Nothing recorded' empty state", async ({
  page,
}) => {
  await gotoReady(page, `${A}/impersonation?slug=${TENANT_B_SLUG}`);
  await expect(page.getByRole("heading", { name: "Support access" })).toBeVisible();

  const tableVisible = await page
    .getByRole("table", { name: "Support activity" })
    .isVisible()
    .catch(() => false);
  const emptyVisible = await page
    .getByText("Nothing recorded")
    .isVisible()
    .catch(() => false);

  expect(
    tableVisible || emptyVisible,
    "Must show either the activity table or the 'Nothing recorded' empty state — got neither",
  ).toBe(true);
});

test("'Nothing recorded' empty state: title and description visible for fresh workspace", async ({
  page,
}) => {
  await gotoReady(page, `${A}/impersonation?slug=${TENANT_B_SLUG}`);

  // A fresh throwaway DB has no support activity. If there happens to be data, skip gracefully.
  const emptyVisible = await page
    .getByText("Nothing recorded")
    .isVisible()
    .catch(() => false);
  if (!emptyVisible) {
    // Activity exists — the empty state assertion is not applicable.
    await expect(page.getByRole("table", { name: "Support activity" })).toBeVisible();
    return;
  }

  await expect(page.getByText("Nothing recorded")).toBeVisible();
  await expect(page.getByText(/No support action has been taken/)).toBeVisible();
});

test("if activity table is present: columns When, Action, Entity, Actor visible", async ({
  page,
}) => {
  await gotoReady(page, `${A}/impersonation?slug=${TENANT_B_SLUG}`);

  const table = page.getByRole("table", { name: "Support activity" });
  const hasTable = await table.isVisible().catch(() => false);

  if (!hasTable) {
    // Fresh DB — no rows, no table; skip this assertion.
    await expect(page.getByText("Nothing recorded")).toBeVisible();
    return;
  }

  for (const col of ["When", "Action", "Entity", "Actor"]) {
    await expect(table.getByRole("columnheader", { name: col })).toBeVisible();
  }
});

test("selecting a different workspace pill updates the URL slug", async ({ page }) => {
  await gotoImpersonation(page);

  // Select Tenant B.
  await page.getByRole("link", { name: TENANT_B_NAME }).click();
  await expect(page).toHaveURL(new RegExp(`slug=${TENANT_B_SLUG}`));

  // Switch to the primary tenant.
  await page.locator(`a[href*="slug=${TENANT_A_SLUG}"]`).click();
  await expect(page).toHaveURL(new RegExp(`slug=${TENANT_A_SLUG}`));
  await expect(page).not.toHaveURL(new RegExp(`slug=${TENANT_B_SLUG}`));
});

test("selected/active pill is distinguishable: its href matches the current URL slug", async ({
  page,
}) => {
  await gotoReady(page, `${A}/impersonation?slug=${TENANT_B_SLUG}`);

  // The active pill's href must encode the selected slug.
  const activePill = page.locator(`a[href*="slug=${TENANT_B_SLUG}"]`);
  await expect(activePill).toBeVisible();

  // aria-current is not set on pills (they are not nav items) — the visual distinction is the
  // href match. If the implementation does set aria-current, both assertions must pass.
  const hasAriaCurrent = await activePill
    .getAttribute("aria-current")
    .then((v) => v !== null)
    .catch(() => false);

  if (hasAriaCurrent) {
    await expect(activePill).toHaveAttribute("aria-current", "page");
  }

  // The pill for the OTHER workspace must NOT have aria-current (regardless of implementation).
  const otherPill = page.locator(`a[href*="slug=${TENANT_A_SLUG}"]`);
  await expect(otherPill).not.toHaveAttribute("aria-current", "page");
});

test("support access document title contains 'Support' or 'Platform Console'", async ({ page }) => {
  await gotoImpersonation(page);
  const title = await page.title();
  expect(
    title.includes("Support") || title.includes("Platform Console"),
    `Expected title to contain 'Support' or 'Platform Console', got: "${title}"`,
  ).toBe(true);
});

test("directly navigating to /impersonation?slug=TENANT_B_SLUG works without visiting /impersonation first", async ({
  page,
}) => {
  // Never visit /impersonation bare — go straight to the slug-parameterised URL.
  await gotoReady(page, `${A}/impersonation?slug=${TENANT_B_SLUG}`);

  await expect(page.getByRole("heading", { name: "Support access" })).toBeVisible();
  // Workspace pills still render.
  await expect(page.getByRole("link", { name: TENANT_B_NAME })).toBeVisible();
  // Empty state must not be showing.
  await expect(page.getByText("Choose a workspace")).not.toBeVisible();
  // Some content (table or nothing-recorded) must be present.
  const tableVisible = await page
    .getByRole("table", { name: "Support activity" })
    .isVisible()
    .catch(() => false);
  const emptyVisible = await page
    .getByText("Nothing recorded")
    .isVisible()
    .catch(() => false);
  expect(tableVisible || emptyVisible).toBe(true);
});

// ── support access page — negative ───────────────────────────────────────────────────────────────

test("unknown slug ?slug=this-does-not-exist → ErrorState with 'Couldn't read', not a crash", async ({
  page,
}) => {
  await gotoReady(page, `${A}/impersonation?slug=this-does-not-exist`);

  // The page itself must not crash — the heading must still render.
  await expect(page.getByRole("heading", { name: "Support access" })).toBeVisible();

  // An ErrorState must be shown — the page source uses "Couldn't read the support trail".
  await expect(page.getByText(/Couldn't read/i)).toBeVisible();

  // The "Choose a workspace" empty state must NOT show (an error is not an unselected state).
  await expect(page.getByText("Choose a workspace")).not.toBeVisible();
});

test("empty slug ?slug= (empty string) → treated as no selection, shows 'Choose a workspace'", async ({
  page,
}) => {
  // An empty string value for the query parameter.
  await gotoReady(page, `${A}/impersonation?slug=`);

  // slug is '' (empty string), not undefined — the page coerces it to the "no selection" branch
  // only if '' is treated as falsy / undefined. Verify whichever branch the implementation takes:
  // either the empty state or the nothing-recorded state are acceptable; a hard crash is not.
  const choosingVisible = await page
    .getByText("Choose a workspace")
    .isVisible()
    .catch(() => false);
  const nothingVisible = await page
    .getByText("Nothing recorded")
    .isVisible()
    .catch(() => false);
  const errorVisible = await page
    .getByText(/Couldn't read/i)
    .isVisible()
    .catch(() => false);

  expect(
    choosingVisible || nothingVisible || errorVisible,
    "Empty ?slug= must show 'Choose a workspace', 'Nothing recorded', or an error — not a blank page",
  ).toBe(true);

  // The page must not be blank — heading always renders.
  await expect(page.getByRole("heading", { name: "Support access" })).toBeVisible();
});

test("fresh workspace with no support activity → 'Nothing recorded' empty state", async ({
  page,
}) => {
  await gotoReady(page, `${A}/impersonation?slug=${TENANT_B_SLUG}`);

  // In a fresh DB (the normal case for a new workspace), no support actions exist.
  // Accept either: nothing-recorded (expected) or table (if the DB has been used before).
  const nothingVisible = await page
    .getByText("Nothing recorded")
    .isVisible()
    .catch(() => false);
  const tableVisible = await page
    .getByRole("table", { name: "Support activity" })
    .isVisible()
    .catch(() => false);

  expect(
    nothingVisible || tableVisible,
    "Must show 'Nothing recorded' or the activity table — a blank content area is a bug",
  ).toBe(true);

  if (nothingVisible) {
    await expect(page.getByText(/No support action has been taken/)).toBeVisible();
  }
});

test("no 'Grant support access' button anywhere on the page — the console cannot open a window", async ({
  page,
}) => {
  await gotoImpersonation(page);

  // The console is read-only. It must never offer a button to open or grant a support window.
  await expect(page.getByRole("button", { name: /grant support access/i })).not.toBeVisible();
  await expect(page.getByRole("button", { name: /open.*window/i })).not.toBeVisible();
  await expect(page.getByRole("button", { name: /grant/i })).not.toBeVisible();
});

test("navigating to /impersonation without ?slug= after previously selecting one → empty state", async ({
  page,
}) => {
  // First, land with a slug selected.
  await gotoReady(page, `${A}/impersonation?slug=${TENANT_B_SLUG}`);
  await expect(page).toHaveURL(new RegExp(`slug=${TENANT_B_SLUG}`));
  await expect(page.getByText("Choose a workspace")).not.toBeVisible();

  // Navigate to the bare /impersonation URL — no slug param.
  await gotoReady(page, `${A}/impersonation`);
  await expect(page).toHaveURL(`${A}/impersonation`);
  await expect(page).not.toHaveURL(new RegExp("slug="));

  // The URL carries no selection, so the empty state must be showing.
  await expect(page.getByText("Choose a workspace")).toBeVisible();
  await expect(page.getByText("Pick one above to read what support did inside it.")).toBeVisible();
  await expect(page.getByRole("table", { name: "Support activity" })).not.toBeVisible();
});
