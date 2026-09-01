import { test, expect } from "@playwright/test";
import { createCandidate } from "./fixtures/api";

/**
 * Bulk-move candidates from the `/candidates` list
 * (`apps/web/src/app/(app)/candidates/candidates-list.tsx`). Targets `CLIENT_INTERVIEW`, one of
 * the ungated stages (`packages/domain/src/rules/stage-gates.ts`), so the fixture needs no
 * email/phone/credential — keeping this test about the bulk-select-and-move mechanic itself.
 */
test("bulk-moves two candidates to a new stage", async ({ page, request }) => {
  const suffix = Date.now();
  const nameA = `E2E Bulk A ${suffix}`;
  const nameB = `E2E Bulk B ${suffix}`;
  await createCandidate(request, nameA);
  await createCandidate(request, nameB);

  // Both fixture names share this timestamp suffix — searching it alone matches both rows
  // without needing an exact/prefix match on the full "E2E Bulk A/B …" name.
  await page.goto(`/candidates?search=${suffix}`);
  await page.getByLabel(`Select ${nameA}`).check();
  await page.getByLabel(`Select ${nameB}`).check();

  await page.getByLabel("Move selected candidates to stage").selectOption("CLIENT_INTERVIEW");
  await page.getByRole("button", { name: "Move", exact: true }).click();

  await expect(page.getByText(/Moved 2 to/)).toBeVisible();
});
