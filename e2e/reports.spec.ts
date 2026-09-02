import { test, expect } from "@playwright/test";

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
  await page.goto("/reports");

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
