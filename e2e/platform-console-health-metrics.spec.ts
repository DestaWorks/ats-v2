import { test, expect, type Page } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";

/**
 * Platform console — Health and Platform metrics pages.
 *
 * Every positive and negative scenario for both pages.
 *
 * Runs in the `platform-console` Playwright project (authenticated session from
 * platform-auth.setup.ts).
 *
 * Scenarios covered
 * ─────────────────
 * HEALTH (positive)
 *   1.  Navigate to /health via sidebar 'Health' link — URL changes, Health gets
 *       aria-current=page, Tenants loses it
 *   2.  Navigate directly to /health by URL — page loads
 *   3.  Heading 'Health' visible, subtitle matches /workspace.*worst first/i
 *   4.  Summary card: DonutChart SVG rendered, all three level labels visible
 *       (critical, warning, ok)
 *   5.  Two healthy seeded workspaces → 'ok' count ≥ 2, 'critical' count = 0
 *   6.  Health table caption 'Tenant health' visible
 *   7.  Health table columns: Workspace, Health, Signals, Seats, Trial
 *   8.  Tenant B row visible with correct slug in Workspace cell
 *   9.  Tenant B row: health badge = 'ok'
 *  10.  Tenant B row: Signals cell = '—'
 *  11.  Tenant B row: Trial cell = '—'
 *  12.  Tenant B row: Seats cell shows a number
 *  13.  Clicking Tenant B name navigates to /tenants/:slug
 *  14.  Browser back from tenant detail returns to /health
 *  15.  Document title contains 'Health' or 'Platform Console'
 *  16.  After Tenant B is suspended: Signals cell shows 'Suspended' signal and
 *       health level is 'critical' or 'warning' — graceful if not suspended
 *
 * HEALTH (negative)
 *  17.  [NOTE] Unauthenticated → /sign-in — covered in platform-console-auth.spec.ts
 *  18.  [NOTE] API unreachable → ErrorState 'Couldn't load' — SSR only; not mocked in E2E
 *  19.  Health table is sorted worst-first: any 'critical' rows appear before 'ok' rows
 *
 * METRICS (positive)
 *  20.  Navigate to /metrics via sidebar 'Platform metrics' link — URL changes, nav
 *       active state updates
 *  21.  Navigate directly to /metrics by URL — page loads
 *  22.  Heading 'Platform metrics' visible, subtitle matches /last \d+ days/i and
 *       /workspaces scanned/i
 *  23.  Workspaces panel: h2 'Workspaces', bold total ≥ 2, TrendChart SVG present
 *  24.  Plan mix panel: h2 'Plan mix', DonutChart SVG present
 *  25.  Seats panel: h2 'Seats', figure rendered
 *  26.  Status panel: h2 'Status', 'active' bucket visible
 *  27.  Scheduled jobs panel: h2 matches /scheduled jobs/i, count or empty message
 *  28.  AI usage panel: h2 'AI usage', data or 'Not readable' fallback
 *  29.  Storage panel: h2 'Storage', data or 'Not readable' fallback
 *  30.  Scheduled jobs TABLE: if present, columns Schedule / Runs / Last occurrence
 *  31.  Document title contains 'metrics' or 'Platform Console'
 *
 * METRICS (negative)
 *  32.  [NOTE] Unauthenticated → /sign-in — covered in platform-console-auth.spec.ts
 *  33.  After a workspace is suspended: Status panel shows a 'suspended' bucket —
 *       graceful if Tenant B has not been suspended in this run
 */

const A = `http://localhost:${process.env["ADMIN_PORT"] ?? "3008"}`;
const TENANT_B_SLUG = process.env["SEED_TENANT_B_SLUG"] ?? "e2e-tenant-b";
const TENANT_B_NAME = process.env["SEED_TENANT_B_NAME"] ?? "E2E Second Workspace";

// ── navigation helper ─────────────────────────────────────────────────────────────────────────────

async function navTo(page: Page, label: string): Promise<void> {
  const nav = page.getByRole("navigation", { name: "Platform console" });
  await nav.getByRole("link", { name: label }).click();
}

// ╔══════════════════════════════════════════════════════════════════════════════════════════════════
// ║  HEALTH
// ╚══════════════════════════════════════════════════════════════════════════════════════════════════

// ── POSITIVE ─────────────────────────────────────────────────────────────────────────────────────

// Scenario 1 — sidebar navigation + aria-current transfer
test("health: navigate via sidebar gives Health aria-current=page and Tenants loses it", async ({
  page,
}) => {
  await gotoReady(page, `${A}/tenants`);

  const nav = page.getByRole("navigation", { name: "Platform console" });
  const healthLink = nav.getByRole("link", { name: "Health" });
  const tenantsLink = nav.getByRole("link", { name: "Tenants" });

  // Pre-condition: Tenants is currently active, Health is not.
  await expect(tenantsLink).toHaveAttribute("aria-current", "page");
  await expect(healthLink).not.toHaveAttribute("aria-current", "page");

  await navTo(page, "Health");

  await expect(page).toHaveURL(`${A}/health`);
  await expect(healthLink).toHaveAttribute("aria-current", "page");
  await expect(tenantsLink).not.toHaveAttribute("aria-current", "page");
});

// Scenario 2 — direct URL navigation
test("health: direct navigation to /health loads the page", async ({ page }) => {
  await gotoReady(page, `${A}/health`);

  await expect(page).toHaveURL(`${A}/health`);
  await expect(page.getByRole("heading", { name: "Health" })).toBeVisible();
});

// Scenario 3 — heading and subtitle
test("health: heading 'Health' visible and subtitle matches /workspace.*worst first/i", async ({
  page,
}) => {
  await gotoReady(page, `${A}/health`);

  await expect(page.getByRole("heading", { name: "Health" })).toBeVisible();
  await expect(page.getByText(/workspace.*worst first/i)).toBeVisible();
});

// Scenario 4 — summary card: DonutChart SVG and all three level labels
test("health: summary card has DonutChart SVG and all three level labels", async ({ page }) => {
  await gotoReady(page, `${A}/health`);

  // The DonutChart is rendered inside the first rounded card section.
  // We look for an SVG that is a sibling of the level meter list.
  const summaryCard = page
    .locator("div")
    .filter({ has: page.locator("svg") })
    .first();
  await expect(summaryCard.locator("svg").first()).toBeVisible();

  // All three levels are always rendered as list items regardless of count.
  await expect(page.getByText("critical")).toBeVisible();
  await expect(page.getByText("warning")).toBeVisible();
  await expect(page.getByText("ok")).toBeVisible();
});

// Scenario 5 — ok count ≥ 2, critical count = 0
test("health: with two healthy seeded workspaces ok count is ≥ 2 and critical count is 0", async ({
  page,
}) => {
  await gotoReady(page, `${A}/health`);

  // Each level is rendered as a <li> containing the level name and a tabular-nums count span.
  // The count is the last .tabular-nums span in that row.
  const levelItems = page.locator("li").filter({ has: page.getByText(/^(critical|warning|ok)$/) });

  // Locate the 'ok' item and read its count.
  const okItem = levelItems.filter({ hasText: /^ok$/ });
  const okCount = okItem.locator("span.tabular-nums, [class*='tabular']").last();
  await expect(okCount).toBeVisible();
  const okText = await okCount.innerText();
  expect(parseInt(okText, 10)).toBeGreaterThanOrEqual(2);

  // Locate the 'critical' item and assert it shows 0.
  const criticalItem = levelItems.filter({ hasText: /^critical$/ });
  const criticalCount = criticalItem.locator("span.tabular-nums, [class*='tabular']").last();
  await expect(criticalCount).toBeVisible();
  await expect(criticalCount).toHaveText("0");
});

// Scenario 6 — table caption
test("health: table caption 'Tenant health' is visible", async ({ page }) => {
  await gotoReady(page, `${A}/health`);

  await expect(page.getByRole("table", { name: "Tenant health" })).toBeVisible();
});

// Scenario 7 — table column headers
test("health: table has columns Workspace, Health, Signals, Seats, Trial", async ({ page }) => {
  await gotoReady(page, `${A}/health`);

  const table = page.getByRole("table", { name: "Tenant health" });

  for (const col of ["Workspace", "Health", "Signals", "Seats", "Trial"]) {
    await expect(table.getByRole("columnheader", { name: col })).toBeVisible();
  }
});

// Scenario 8 — Tenant B row visible with correct slug
test("health: Tenant B row is visible with the correct slug in the Workspace cell", async ({
  page,
}) => {
  await gotoReady(page, `${A}/health`);

  const table = page.getByRole("table", { name: "Tenant health" });
  const row = table.getByRole("row").filter({ hasText: TENANT_B_NAME });

  await expect(row).toBeVisible();
  // The slug is rendered as a sub-line directly below the name link.
  await expect(row.getByText(TENANT_B_SLUG)).toBeVisible();
});

// Scenario 9 — Tenant B health badge = 'ok'
test("health: Tenant B row shows health badge 'ok' on a fresh seeded workspace", async ({
  page,
}) => {
  await gotoReady(page, `${A}/health`);

  const table = page.getByRole("table", { name: "Tenant health" });
  const row = table.getByRole("row").filter({ hasText: TENANT_B_NAME });

  // The health badge text for a clean workspace is 'ok'.
  await expect(row.getByText("ok", { exact: true })).toBeVisible();
});

// Scenario 10 — Tenant B Signals cell = '—'
test("health: Tenant B row Signals cell shows '—' when there are no signals", async ({ page }) => {
  await gotoReady(page, `${A}/health`);

  const table = page.getByRole("table", { name: "Tenant health" });
  const row = table.getByRole("row").filter({ hasText: TENANT_B_NAME });

  // When signals is empty the page renders a literal em-dash.
  // There may be multiple '—' cells (Signals and Trial); assert at least one.
  await expect(row.getByText("—").first()).toBeVisible();
});

// Scenario 11 — Tenant B Trial cell = '—'
test("health: Tenant B row Trial cell shows '—' when no trial is set", async ({ page }) => {
  await gotoReady(page, `${A}/health`);

  const table = page.getByRole("table", { name: "Tenant health" });
  const row = table.getByRole("row").filter({ hasText: TENANT_B_NAME });

  // Trial is the last <td> in the row. The helper `trial()` returns '—' when null.
  // The em-dashes in Signals and Trial may both be present; count at least 2.
  const dashes = row.getByText("—");
  await expect(dashes).toHaveCount(2); // Signals cell + Trial cell
});

// Scenario 12 — Tenant B Seats cell shows a number
test("health: Tenant B row Seats cell contains a numeric value", async ({ page }) => {
  await gotoReady(page, `${A}/health`);

  const table = page.getByRole("table", { name: "Tenant health" });
  const row = table.getByRole("row").filter({ hasText: TENANT_B_NAME });

  // Seats are always rendered as '${used}' or '${used} / ${limit}'.
  // A seeded workspace has at least one member, so used ≥ 1.
  const cells = row.getByRole("cell");
  const count = await cells.count();
  // Seats is the 4th <td> (0-indexed: Workspace=0, Health=1, Signals=2, Seats=3, Trial=4).
  const seatsCell = cells.nth(3);
  await expect(seatsCell).toBeVisible();
  const text = await seatsCell.innerText();
  // Must contain at least one digit.
  expect(text).toMatch(/\d/);
  // count is declared to suppress the unused warning; the real assertion is above.
  expect(count).toBeGreaterThan(0);
});

// Scenario 13 — clicking Tenant B name navigates to its detail page
test("health: clicking Tenant B name in the health table navigates to /tenants/:slug", async ({
  page,
}) => {
  await gotoReady(page, `${A}/health`);

  const table = page.getByRole("table", { name: "Tenant health" });
  await table.getByRole("link", { name: TENANT_B_NAME }).click();

  await expect(page).toHaveURL(`${A}/tenants/${TENANT_B_SLUG}`);
  // The detail page heading names the workspace.
  await expect(page.getByRole("heading", { name: TENANT_B_NAME })).toBeVisible();
});

// Scenario 14 — browser back returns to /health
test("health: browser back from tenant detail returns to /health with heading visible", async ({
  page,
}) => {
  await gotoReady(page, `${A}/health`);

  const table = page.getByRole("table", { name: "Tenant health" });
  await table.getByRole("link", { name: TENANT_B_NAME }).click();
  await expect(page).toHaveURL(`${A}/tenants/${TENANT_B_SLUG}`);

  await page.goBack();

  await expect(page).toHaveURL(`${A}/health`);
  await expect(page.getByRole("heading", { name: "Health" })).toBeVisible();
});

// Scenario 15 — document title
test("health: document title contains 'Health' or 'Platform Console'", async ({ page }) => {
  await gotoReady(page, `${A}/health`);

  // metadata.title is "Health · Platform Console".
  await expect(page).toHaveTitle(/health|platform console/i);
});

// Scenario 16 — graceful suspended-workspace signal check
test("health: Tenant B shows suspended signal and critical/warning level if previously suspended", async ({
  page,
}) => {
  // This test is intentionally non-destructive: it reads state left by another spec
  // (platform-console-tenants.spec.ts which suspends and then restores Tenant B).
  // If Tenant B is active (clean run or restore already happened) we assert 'ok' instead.

  await gotoReady(page, `${A}/health`);

  const table = page.getByRole("table", { name: "Tenant health" });
  const row = table.getByRole("row").filter({ hasText: TENANT_B_NAME });
  await expect(row).toBeVisible();

  // Check the detail page to find out whether Tenant B is currently suspended.
  await gotoReady(page, `${A}/tenants/${TENANT_B_SLUG}`);
  const isSuspended = await page
    .getByText("suspended", { exact: true })
    .isVisible()
    .catch(() => false);

  await gotoReady(page, `${A}/health`);
  const healthRow = table.getByRole("row").filter({ hasText: TENANT_B_NAME });

  if (isSuspended) {
    // The SIGNAL_LABEL for 'suspended' is "Suspended — every member is refused".
    await expect(healthRow.getByText(/Suspended/i)).toBeVisible();
    // Level must be 'critical' or 'warning' — never 'ok' when suspended.
    const badge = healthRow.getByText(/critical|warning/);
    await expect(badge).toBeVisible();
  } else {
    // Fresh run or Tenant B was already restored — should be healthy.
    await expect(healthRow.getByText("ok", { exact: true })).toBeVisible();
  }
});

// ── NEGATIVE ─────────────────────────────────────────────────────────────────────────────────────

// Scenario 17 — NOTE: unauthenticated redirect tested elsewhere
// NOTE: Unauthenticated direct navigation to /health → redirects to /sign-in is covered by
// platform-console-auth.spec.ts ("After sign-out, every protected route redirects to /sign-in").
// It is not duplicated here to keep the auth contract in one place.

// Scenario 18 — NOTE: SSR error state not mockable in E2E
// NOTE: When PLATFORM_API_URL is unreachable, the health page (server-rendered) renders:
//   <ErrorState title="Couldn't load tenant health" message={...} />
// This is implemented in apps/admin/src/app/(console)/health/page.tsx and uses the
// @destaworks/ui/error-state component. It cannot be triggered in E2E without pulling
// the API offline for a single test, which would affect concurrent tests.
// The component path is verified structurally by static analysis (arch:check / typecheck).

// Scenario 19 — worst-first sort order
test("health: table rows are sorted worst-first (critical before ok)", async ({ page }) => {
  await gotoReady(page, `${A}/health`);

  const table = page.getByRole("table", { name: "Tenant health" });
  await expect(table).toBeVisible();

  // Collect the text of every Health cell in row order.
  // <td> at index 1 (0-based) is the Health badge cell.
  const rows = table.getByRole("row").filter({ hasNot: table.getByRole("columnheader") });
  const rowCount = await rows.count();

  if (rowCount < 2) {
    // Cannot assert ordering with fewer than two rows; skip gracefully.
    return;
  }

  const levels: string[] = [];
  for (let i = 0; i < rowCount; i++) {
    const cells = rows.nth(i).getByRole("cell");
    const healthCell = cells.nth(1);
    const text = (await healthCell.innerText()).trim().toLowerCase();
    if (text === "critical" || text === "warning" || text === "ok") {
      levels.push(text);
    }
  }

  // Verify that no 'ok' row precedes a 'critical' row.
  // RANK: critical=0, warning=1, ok=2 — a later rank must never be smaller than an earlier one.
  const RANK: Record<string, number> = { critical: 0, warning: 1, ok: 2 };
  for (let i = 1; i < levels.length; i++) {
    const prev = RANK[levels[i - 1]!] ?? 99;
    const curr = RANK[levels[i]!] ?? 99;
    expect(
      curr,
      `Row ${i} (${levels[i]}) should not precede row ${i - 1} (${levels[i - 1]}) in worst-first order`,
    ).toBeGreaterThanOrEqual(prev);
  }
});

// ╔══════════════════════════════════════════════════════════════════════════════════════════════════
// ║  METRICS
// ╚══════════════════════════════════════════════════════════════════════════════════════════════════

// ── POSITIVE ─────────────────────────────────────────────────────────────────────────────────────

// Scenario 20 — sidebar navigation + aria-current transfer
test("metrics: navigate via sidebar 'Platform metrics' link gives it aria-current=page", async ({
  page,
}) => {
  await gotoReady(page, `${A}/tenants`);

  const nav = page.getByRole("navigation", { name: "Platform console" });
  const metricsLink = nav.getByRole("link", { name: "Platform metrics" });
  const tenantsLink = nav.getByRole("link", { name: "Tenants" });

  await expect(tenantsLink).toHaveAttribute("aria-current", "page");
  await expect(metricsLink).not.toHaveAttribute("aria-current", "page");

  await navTo(page, "Platform metrics");

  await expect(page).toHaveURL(`${A}/metrics`);
  await expect(metricsLink).toHaveAttribute("aria-current", "page");
  await expect(tenantsLink).not.toHaveAttribute("aria-current", "page");
});

// Scenario 21 — direct URL navigation
test("metrics: direct navigation to /metrics loads the page", async ({ page }) => {
  await gotoReady(page, `${A}/metrics`);

  await expect(page).toHaveURL(`${A}/metrics`);
  await expect(page.getByRole("heading", { name: "Platform metrics" })).toBeVisible();
});

// Scenario 22 — heading and subtitle
test("metrics: heading 'Platform metrics' and subtitle match /last \\d+ days/i and /workspaces scanned/i", async ({
  page,
}) => {
  await gotoReady(page, `${A}/metrics`);

  await expect(page.getByRole("heading", { name: "Platform metrics" })).toBeVisible();
  await expect(page.getByText(/last \d+ days/i)).toBeVisible();
  await expect(page.getByText(/workspaces scanned/i)).toBeVisible();
});

// Scenario 23 — Workspaces panel
test("metrics: Workspaces panel has h2, bold total ≥ 2, and TrendChart SVG", async ({ page }) => {
  await gotoReady(page, `${A}/metrics`);

  const panel = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Workspaces", level: 2 }) });
  await expect(panel).toBeVisible();

  // The total is rendered as a text-4xl bold number (`.text-4xl` font size class).
  // We locate it by its role — it is not interactive, so we read by its prominent size.
  const total = panel.locator(".text-4xl").first();
  await expect(total).toBeVisible();
  const totalText = (await total.innerText()).trim();
  expect(parseInt(totalText, 10)).toBeGreaterThanOrEqual(2);

  // TrendChart renders as <svg>.
  await expect(panel.locator("svg")).toBeVisible();
});

// Scenario 24 — Plan mix panel
test("metrics: Plan mix panel has h2 and DonutChart SVG", async ({ page }) => {
  await gotoReady(page, `${A}/metrics`);

  const panel = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Plan mix", level: 2 }) });
  await expect(panel).toBeVisible();
  await expect(panel.locator("svg")).toBeVisible();
});

// Scenario 25 — Seats panel
test("metrics: Seats panel has h2 and renders a seat figure", async ({ page }) => {
  await gotoReady(page, `${A}/metrics`);

  const panel = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Seats", level: 2 }) });
  await expect(panel).toBeVisible();

  // The Figure component renders a .text-2xl span. A zero renders '—'; a non-zero renders a
  // numeric string. Either is valid here — we just confirm a figure element is present.
  await expect(panel.locator(".text-2xl").first()).toBeVisible();
});

// Scenario 26 — Status panel with 'active' bucket
test("metrics: Status panel has h2 and 'active' bucket is visible", async ({ page }) => {
  await gotoReady(page, `${A}/metrics`);

  const panel = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Status", level: 2 }) });
  await expect(panel).toBeVisible();

  // Both seeded workspaces are 'active' — the 'active' list item must be visible.
  await expect(panel.getByText("active")).toBeVisible();
});

// Scenario 27 — Scheduled jobs panel
test("metrics: Scheduled jobs panel has h2 and renders a count or empty message", async ({
  page,
}) => {
  await gotoReady(page, `${A}/metrics`);

  const panel = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { level: 2, name: /scheduled jobs/i }) });
  await expect(panel).toBeVisible();

  // The panel always renders: either a Figure (.text-2xl) or the empty note.
  const hasFigure = await panel
    .locator(".text-2xl")
    .first()
    .isVisible()
    .catch(() => false);
  const hasEmptyNote = await panel
    .getByText(/No scheduled run has been claimed/i)
    .isVisible()
    .catch(() => false);

  expect(
    hasFigure || hasEmptyNote,
    "Scheduled jobs panel must render a run count or the empty-state note",
  ).toBe(true);
});

// Scenario 28 — AI usage panel
test("metrics: AI usage panel has h2 and renders data or 'Not readable' fallback", async ({
  page,
}) => {
  await gotoReady(page, `${A}/metrics`);

  const panel = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "AI usage", level: 2 }) });
  await expect(panel).toBeVisible();

  // When aiUsage is non-null the panel shows 'calls', 'errors', 'tokens' labels.
  // When null it shows the Unreadable component: "Not readable — …"
  const hasData = await panel
    .getByText("calls")
    .isVisible()
    .catch(() => false);
  const hasFallback = await panel
    .getByText(/Not readable/i)
    .isVisible()
    .catch(() => false);

  expect(
    hasData || hasFallback,
    "AI usage panel must render data labels or the 'Not readable' fallback",
  ).toBe(true);
});

// Scenario 29 — Storage panel
test("metrics: Storage panel has h2 and renders data or 'Not readable' fallback", async ({
  page,
}) => {
  await gotoReady(page, `${A}/metrics`);

  const panel = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Storage", level: 2 }) });
  await expect(panel).toBeVisible();

  // When storage is non-null the panel shows 'documents', 'MB known', 'unsized' labels.
  // When null it shows the Unreadable component.
  const hasData = await panel
    .getByText("documents")
    .isVisible()
    .catch(() => false);
  const hasFallback = await panel
    .getByText(/Not readable/i)
    .isVisible()
    .catch(() => false);

  expect(
    hasData || hasFallback,
    "Storage panel must render data labels or the 'Not readable' fallback",
  ).toBe(true);
});

// Scenario 30 — Scheduled jobs table columns (when schedules > 0)
test("metrics: Scheduled jobs table has columns Schedule, Runs, Last occurrence when present", async ({
  page,
}) => {
  await gotoReady(page, `${A}/metrics`);

  // The table is only rendered when m.jobs.schedules.length > 0 — skip gracefully if absent.
  const table = page.getByRole("table", { name: "Scheduled jobs" });
  const tableVisible = await table.isVisible().catch(() => false);

  if (!tableVisible) {
    // No jobs have run yet in a fresh database — valid state, nothing to assert.
    return;
  }

  for (const col of ["Schedule", "Runs", "Last occurrence"]) {
    await expect(table.getByRole("columnheader", { name: col })).toBeVisible();
  }
});

// Scenario 31 — document title
test("metrics: document title contains 'metrics' or 'Platform Console'", async ({ page }) => {
  await gotoReady(page, `${A}/metrics`);

  // metadata.title is "Platform metrics · Platform Console".
  await expect(page).toHaveTitle(/metrics|platform console/i);
});

// ── NEGATIVE ─────────────────────────────────────────────────────────────────────────────────────

// Scenario 32 — NOTE: unauthenticated redirect tested elsewhere
// NOTE: Unauthenticated direct navigation to /metrics → redirects to /sign-in is covered by
// platform-console-auth.spec.ts ("After sign-out, every protected route redirects to /sign-in").
// It is not duplicated here to keep the auth contract in one place.

// Scenario 33 — Status panel shows 'suspended' bucket after a workspace is suspended
test("metrics: Status panel shows a 'suspended' bucket when Tenant B has been suspended", async ({
  page,
}) => {
  // Non-destructive: this test reads state left by another spec. If Tenant B is active
  // (clean run or restore already happened) we assert that 'active' is still the only bucket
  // visible and skip the 'suspended' check gracefully.

  // First, determine whether Tenant B is currently suspended by inspecting its detail page.
  await gotoReady(page, `${A}/tenants/${TENANT_B_SLUG}`);
  const isSuspended = await page
    .getByText("suspended", { exact: true })
    .isVisible()
    .catch(() => false);

  // Now go to metrics and check the Status panel.
  await gotoReady(page, `${A}/metrics`);

  const panel = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Status", level: 2 }) });
  await expect(panel).toBeVisible();

  if (isSuspended) {
    // A 'suspended' status bucket must appear in the panel list.
    await expect(panel.getByText("suspended")).toBeVisible();
  } else {
    // Not suspended — 'active' is still present, 'suspended' may or may not appear.
    // We only assert that the panel itself is healthy (active bucket present).
    await expect(panel.getByText("active")).toBeVisible();
  }
});
