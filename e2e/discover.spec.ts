import { test, expect } from "@playwright/test";

/**
 * Discover / NPPES (`apps/web/src/app/(app)/discover/discover-search-form.tsx`,
 * `discover-results-table.tsx`) — search the live public NPPES provider registry, add a new match
 * to Sourcing. Deliberately hits the real NPPES API (no mock/sandbox exists — same as how Wave 2.7
 * itself was verified per `docs/IMPLEMENTATION-PLAN.md`): a broad taxonomy + a large state all but
 * guarantees results, and at least one is "new" (not already in this app's Sourcing/Pipeline) since
 * NPPES has far more providers of any given type than this app has sourced. Whichever provider
 * happens to be first is fine — the spec never depends on a specific person.
 */
test("searches NPPES and adds a new match to Sourcing", async ({ page }) => {
  await page.goto("/discover");

  await page.getByLabel("Provider type").selectOption({ label: "Psychiatry (MD/DO)" });
  await page.getByLabel("State").selectOption("CA");
  await page.getByRole("button", { name: "Search NPPES" }).click();

  const checkbox = page.locator('input[type="checkbox"][aria-label^="Select "]').first();
  await expect(checkbox).toBeVisible();
  const label = (await checkbox.getAttribute("aria-label")) ?? "";
  const name = label.replace(/^Select /, "");
  await checkbox.check();

  await page.getByRole("button", { name: /^Add \d+ to Sourcing$/ }).click();
  await expect(page.getByText(/Added \d+ to Sourcing/)).toBeVisible();

  await page.goto("/sourcing");
  await expect(page.getByRole("row").filter({ hasText: name })).toBeVisible();
});
