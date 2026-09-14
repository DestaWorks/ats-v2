import { test, expect } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";

/**
 * Discover / NPPES (`apps/web/src/app/(app)/discover/discover-search-form.tsx`,
 * `discover-results-table.tsx`) — search the live public NPPES provider registry, add a new match
 * to Sourcing. Deliberately hits the real NPPES API (no mock/sandbox exists — same as how Wave 2.7
 * itself was verified per `docs/IMPLEMENTATION-PLAN.md`). Whichever provider happens to be first is
 * fine — the spec never depends on a specific person.
 *
 * "New" means not already in this app's Sourcing/Pipeline, so the supply is consumed by running
 * this: against a throwaway database (CI) every result is new, while a persistent one eventually
 * has the whole first page already sourced and the per-row checkboxes disappear. That state is
 * asserted rather than failed on — the row count still proves the search itself worked.
 */
test("searches NPPES and adds a new match to Sourcing", async ({ page }) => {
  await gotoReady(page, "/discover");

  await page.getByLabel("Provider type").selectOption({ label: "Psychiatry (MD/DO)" });
  await page.getByLabel("State").selectOption("CA");
  await page.getByRole("button", { name: "Search NPPES" }).click();

  const selectAll = page.getByRole("checkbox", { name: "Select all new results" });
  await expect(selectAll).toBeVisible();

  // Per-ROW checkboxes only: the "select all" control shares the `Select ` prefix and is disabled
  // whenever nothing on the page is new.
  const rowBoxes = page.locator(
    'input[type="checkbox"][aria-label^="Select "]:not([aria-label="Select all new results"])',
  );

  if ((await rowBoxes.count()) === 0) {
    await expect(selectAll).toBeDisabled();
    await expect(page.getByRole("row")).not.toHaveCount(0);
    return;
  }

  const checkbox = rowBoxes.first();
  const label = (await checkbox.getAttribute("aria-label")) ?? "";
  const name = label.replace(/^Select /, "");
  await checkbox.check();

  await page.getByRole("button", { name: /^Add \d+ to Sourcing$/ }).click();
  await expect(page.getByText(/Added \d+ to Sourcing/)).toBeVisible();

  await gotoReady(page, "/sourcing");
  await expect(page.getByRole("row").filter({ hasText: name }).first()).toBeVisible();
});
