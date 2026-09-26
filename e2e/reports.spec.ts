import { test, expect } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";

/**
 * Reports (Wave 5.2) — leadership-gated `viewReports`, 10 server-computed report tabs sharing
 * one filter bar (`reports-view.tsx`). Executive is server-fetched on first load
 * (`reports/page.tsx`) so it renders without a loading flash; the other 9 tabs fetch
 * client-side on first select (`ReportTabShell`). This covers: the seeded/prefetched Executive
 * tab renders real stat cards and section headings, and switching to a second tab
 * (Pipeline Funnel) actually triggers its own fetch and renders distinct content — proving tab
 * switching re-fetches rather than reusing stale Executive data.
 */
test("renders the Executive report and switches to Pipeline Funnel", async ({ page }) => {
  await gotoReady(page, "/reports");

  await expect(page.getByRole("heading", { name: "Reports", exact: true })).toBeVisible();

  // Executive tab is server-prefetched and selected by default.
  await expect(page.getByText("Total", { exact: true })).toBeVisible();
  await expect(page.getByText("Placed", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pipeline Distribution" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Top Candidates by Fit" })).toBeVisible();

  await page.getByRole("tab", { name: "Pipeline Funnel" }).click();

  // Distinct content only Pipeline Funnel renders — proves the tab switch fetched fresh data
  // rather than leaving the Executive panel's DOM in place.
  await expect(
    page.getByText("Candidates who EVER reached this stage or beyond", { exact: false }),
  ).toBeVisible();
});

const REPORTS_API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3004";

const REPORT_TABS = [
  "executive",
  "pipeline-funnel",
  "client-funnel",
  "client-portfolio",
  "client-capacity",
  "team-performance",
  "source-roi",
  "time-analysis",
  "compliance",
  "mass-journey",
  "trends",
] as const;

test("every report answers on its own endpoint", async ({ request }) => {
  for (const tab of REPORT_TABS) {
    const response = await request.get(`${REPORTS_API_BASE}/reports/${tab}`);
    expect(response.status(), `GET /reports/${tab}`).toBe(200);
  }
});

test("narrows the figures to a date range with nothing in it", async ({ request }) => {
  const all = await request.get(`${REPORTS_API_BASE}/reports/executive`);
  const { total } = (await all.json()) as { total: number };
  expect(total, "the seeded workspace has candidates to filter out").toBeGreaterThan(0);

  const empty = await request.get(
    `${REPORTS_API_BASE}/reports/executive?addedFrom=1900-01-01&addedTo=1900-12-31`,
  );
  expect(empty.status()).toBe(200);
  const narrowed = (await empty.json()) as { total: number; placed: number };
  expect(narrowed.total).toBe(0);
  expect(narrowed.placed).toBe(0);
});

test("refuses a report filtered on a malformed date", async ({ request }) => {
  const response = await request.get(`${REPORTS_API_BASE}/reports/executive?addedFrom=not-a-date`);

  expect(response.status()).toBe(422);
});

test("shows the empty state rather than zeros for a range with no candidates", async ({ page }) => {
  await gotoReady(page, "/reports");
  await page.getByLabel("Added from").fill("1900-01-01");
  await page.getByLabel("Added to").fill("1900-12-31");

  await expect(page.getByText("No scored candidates")).toBeVisible();
});
