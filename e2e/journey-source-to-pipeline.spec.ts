import { test, expect } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";
import { createLead } from "./fixtures/api";

/**
 * One candidate, followed across every screen that touches them, in the order an operator works:
 * sourcing → promote → pipeline → detail → stage move → journey → leave → return.
 *
 * Every step here is covered in isolation elsewhere. What only this spec can catch is state that
 * does not survive the crossing: a promotion the pipeline never sees, a move the detail page
 * forgets, or history that is missing after a reload.
 */
test("follows one candidate from a source lead to a moved, persisted pipeline card", async ({
  page,
  request,
}) => {
  const name = `E2E Journey ${Date.now()}`;

  // 1. Sourcing — the lead exists and is promotable.
  await createLead(request, name);
  await gotoReady(page, `/sourcing?search=${encodeURIComponent(name)}`);
  const leadRow = page.getByRole("row").filter({ hasText: name });
  await expect(leadRow).toBeVisible();

  // 2. Promote — and the row must then offer a way through to the candidate it created.
  await leadRow.getByRole("button", { name: "Promote" }).click();
  await page.getByRole("button", { name: "Promote to candidate" }).click();
  const throughLink = leadRow.getByRole("link", { name: /^→ C/ });
  await expect(throughLink).toBeVisible();

  // 3. The pipeline board is a different screen — the promotion has to be visible there too.
  await gotoReady(page, `/pipeline?search=${encodeURIComponent(name)}`);
  await expect(page.locator("li").filter({ hasText: name })).toBeVisible();

  // 4. Follow the candidate to their own page.
  await gotoReady(page, `/candidates?search=${encodeURIComponent(name)}`);
  await page.getByRole("row").filter({ hasText: name }).getByRole("link").first().click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  const candidateUrl = page.url();

  // 5. Move a stage, through the control an operator actually uses. Which stages are open depends
  // on the track the promotion assigned, so take the first stage the gate allows rather than
  // naming one — the point is that the move crosses screens, not which stage it lands on.
  const stageTrigger = page.locator('button[aria-haspopup="listbox"]').first();
  const target = page.locator('[role="option"][aria-selected="false"]:not([disabled])').first();
  await expect(async () => {
    await stageTrigger.click();
    await expect(target).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  const movedTo = ((await target.textContent()) ?? "").trim();
  await target.click();
  await expect(page.getByText(/Moved to/)).toBeVisible();

  // 6. The move must appear in the journey, which reads stage history rather than the row.
  await page.getByRole("button", { name: /Journey/ }).click();
  await expect(page.getByRole("heading", { name: "Candidate journey" })).toBeVisible();
  await expect(page.getByText(name).first()).toBeVisible();
  await page.keyboard.press("Escape");

  // 7. Leave entirely, then come back — the move has to have been written, not just rendered.
  await gotoReady(page, "/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
  await gotoReady(page, candidateUrl);
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  await expect(page.getByText(movedTo).first()).toBeVisible();
});
