import { test, expect } from "@playwright/test";
import { gotoReady, clickUntilSettled } from "./fixtures/navigate";
import { createCandidate } from "./fixtures/api";

/**
 * A refusal the server enforces and a refusal the operator can see are two different facts, and
 * the suite mostly proved the first. `messageForFailure` returning a candidate-specific string for
 * every NOT_FOUND is what an API-only assertion cannot catch.
 */

const GATED_STAGE = "Qualified (Pre-Screen)";

test("marks a gated stage Blocked on the candidate's own page", async ({ page, request }) => {
  // Clinical requires a credential, so a bare Clinical candidate is gated out of Pre-Screen.
  const candidateId = await createCandidate(request, `E2E Gated ${Date.now()}`, "Clinical");

  await gotoReady(page, `/candidates/${candidateId}`);

  // Retried as a unit: a click landing before React attaches is dropped silently, and the wait
  // that follows then burns the full timeout on options that will never render.
  const stageTrigger = page.locator('button[aria-haspopup="listbox"]').first();
  const gated = page.getByRole("option").filter({ hasText: GATED_STAGE });
  await clickUntilSettled(stageTrigger, () => expect(gated).toBeVisible({ timeout: 2_000 }));
  await expect(gated).toBeVisible();
  await expect(gated).toBeDisabled();
  await expect(gated).toContainText("Blocked");
});

test("names the candidate a bulk move could not take, rather than skipping it silently", async ({
  page,
  request,
}) => {
  const gatedName = `E2E Bulk Gated ${Date.now()}`;
  await createCandidate(request, gatedName, "Clinical");

  await gotoReady(page, `/candidates?search=${encodeURIComponent(gatedName)}`);
  const row = page.getByRole("row").filter({ hasText: gatedName });
  await expect(row).toBeVisible();
  await row.getByRole("checkbox").first().check();

  await page.getByLabel("Move selected candidates to stage").selectOption({ label: GATED_STAGE });
  await page.getByRole("button", { name: "Move", exact: true }).click();

  await expect(page.getByText(/\d+ blocked/)).toBeVisible();
  await expect(page.getByText(/Credential required/)).toBeVisible();
});

test("shows the invite refusal on screen, not only in the response", async ({ page }) => {
  await gotoReady(page, "/workspace");
  await page.getByRole("button", { name: "Invite member", exact: true }).click();
  await page.getByLabel("Email").fill(`e2e-nobody-${Date.now()}@example.com`);
  await page.getByRole("button", { name: "Send invitation", exact: true }).click();

  // Before `messageForFailure` was fixed this read "This candidate no longer exists." here.
  await expect(page.getByText("No account with that email address")).toBeVisible();
});

test("refuses an empty candidate name at the field, not just at the API", async ({ page }) => {
  await gotoReady(page, "/candidates/new");
  await page.locator('button[type="submit"]').filter({ hasText: "Add Candidate" }).click();

  await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(page).toHaveURL(/\/candidates\/new/);
});
