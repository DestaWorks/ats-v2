import { test, expect } from "@playwright/test";
import { createCandidate } from "./fixtures/api";

/**
 * Candidate detail tabs: verify a license, add a note, log outreach
 * (`apps/web/src/app/(app)/candidates/[id]/license-tab.tsx`, `notes-tab.tsx`,
 * `outreach-tab.tsx`). One `Clinical`-track candidate fixture — the License tab is hidden
 * entirely for `Operations` (`trackFieldVisibility`), unlike the Operations fixture used
 * elsewhere in this suite.
 */
test("verifies a license, adds a note, and logs outreach", async ({ page, request }) => {
  const candidateId = await createCandidate(
    request,
    `E2E Detail Candidate ${Date.now()}`,
    "Clinical",
  );

  await page.goto(`/candidates/${candidateId}`);

  await page.getByRole("tab", { name: "License" }).click();
  await page.getByRole("button", { name: "Verify license" }).click();
  await page.getByLabel("Status").selectOption("Active");
  await page.getByLabel("Expiry").fill("2027-01-01");
  await page.getByRole("button", { name: "Save verification" }).click();
  await expect(page.getByText("Active").first()).toBeVisible();

  const noteText = `E2E note ${Date.now()}`;
  await page.getByRole("tab", { name: "Notes" }).click();
  await page.getByLabel("Add a note").fill(noteText);
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByText(noteText)).toBeVisible();

  const outreachNote = `E2E outreach ${Date.now()}`;
  await page.getByRole("tab", { name: "Outreach" }).click();
  await page.getByLabel("Note (optional)").fill(outreachNote);
  await page.getByRole("button", { name: "Log outreach" }).click();
  await expect(page.getByText(outreachNote)).toBeVisible();
});
