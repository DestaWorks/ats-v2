import { test, expect } from "@playwright/test";
import { createCandidate, deleteCandidate } from "./fixtures/api";

/**
 * Restore a soft-deleted candidate from Trash (`apps/web/src/app/(app)/trash/trash-list.tsx`).
 * The candidate is created and soft-deleted via the API first, so the test exercises only the
 * restore interaction. Trash loads newest-deleted-first with no search filter, so the row is
 * located by its unique fixture name rather than by position.
 */
test("restores a soft-deleted candidate", async ({ page, request }) => {
  const name = `E2E Trash Candidate ${Date.now()}`;
  const candidateId = await createCandidate(request, name);
  await deleteCandidate(request, candidateId);

  await page.goto("/trash");
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: "Restore" }).click();
  await expect(row).not.toBeVisible();
});
