import { test, expect } from "@playwright/test";

/**
 * Add/move candidate — one of the four critical flows (docs/CONVENTIONS.md §10).
 *
 * Uses the `Operations` track: it only needs contact info (`trackFieldVisibility` hides the
 * credential/license fields), and an email satisfies the `QUALIFIED_PRESCREEN` stage gate
 * (`packages/domain/src/rules/stage-gates.ts` — Operations needs email or phone, nothing else).
 *
 * The name carries a run-unique suffix so the board's `?search=` filter (matches name/email,
 * `packages/contracts/src/validation/pipeline.ts`) finds exactly this run's card even against an
 * E2E database that accumulates rows across runs.
 */
test("adds a candidate and moves it to the next pipeline stage", async ({ page }) => {
  const name = `E2E Candidate ${Date.now()}`;

  await page.goto("/candidates/new");
  await page.getByLabel("Full Name").fill(name);
  await page.getByLabel("Track").selectOption("Operations");
  await page.getByLabel("Email").fill(`e2e-${Date.now()}@example.com`);
  // exact: true — the app shell also renders a persistent "+ Add Candidate" nav button on this
  // page, which `Add Candidate` substring-matches otherwise.
  await page.getByRole("button", { name: "Add Candidate", exact: true }).click();

  // Success redirects to the new candidate's detail page (an intercepted route/modal).
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();

  await page.goto(`/pipeline?search=${encodeURIComponent(name)}`);
  // Not `getByRole("listitem")`: Tailwind's preflight sets `list-style: none` on every `<ul>`,
  // which strips the implicit `list`/`listitem` roles in Chromium — the tag selector is reliable
  // regardless of that CSS reset.
  const card = page.locator("li").filter({ hasText: name });
  await expect(card).toBeVisible();

  await card.getByLabel(`Move ${name} to a different stage`).selectOption("QUALIFIED_PRESCREEN");

  await expect(
    page.getByRole("group", { name: /Qualified \(Pre-Screen\)/ }).getByText(name),
  ).toBeVisible();
});
