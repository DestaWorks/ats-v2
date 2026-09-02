import { test, expect } from "@playwright/test";

/**
 * Weekly Brief (`weekly-brief-view.tsx`) — leadership-gated `viewReports`. "Generate"/"Find
 * Patterns" are AI-backed job-queue flows (poll-for-draft, ~real generation time) that would need
 * either a real AI key or mocking the job-queue polling contract, not just one HTTP call — out of
 * scope here. This covers the deterministic part instead: picking a week with no saved brief
 * renders the empty state rather than a stale/wrong week's data, proving the week-picker actually
 * drives the fetch (`refresh()` in `weekly-brief-view.tsx`).
 */
test("shows the empty state for a week with no saved brief", async ({ page }) => {
  await page.goto("/weekly-brief");

  await expect(page.getByRole("heading", { name: "Weekly Brief", level: 1 })).toBeVisible();

  // A week far in the future can never have a saved brief seeded by any other spec's fixtures.
  // The input's `onChange` normalizes whatever date is typed to that week's Monday
  // (`mondayOf(e.target.value)` in `weekly-brief-view.tsx`), so read the normalized value back
  // rather than assuming which day of the week the picked date falls on.
  const weekInput = page.getByLabel("Week of (Monday)");
  await weekInput.fill("2099-01-01");
  const normalizedMonday = await weekInput.inputValue();

  await expect(
    page.getByText(`No brief saved for the week of ${normalizedMonday} yet`, { exact: false }),
  ).toBeVisible();
});
