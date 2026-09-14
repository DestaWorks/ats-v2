import { test, expect } from "@playwright/test";
import { createCandidate, verifyLicense } from "./fixtures/api";

/**
 * License Verify (`apps/web/src/app/(app)/license-verify/page.tsx`) — a read-only Verification
 * Queue + Expiry Timeline; the verify form itself lives on the candidate detail License tab
 * (already covered by `candidate-detail.spec.ts`), so this only proves the dashboard surfaces a
 * verified candidate and links back to their detail page.
 *
 * Uses the Expiry Timeline, not the Verification Queue: the queue is capped at 100 and sorted
 * oldest-first (`license-verify.repository.ts`), so a freshly-created fixture candidate — always
 * the newest — could fall off the cap in a long-lived shared dev DB. The timeline is sorted
 * soonest-expiry-first and capped at 12; an already-expired fixture date sorts before any real
 * candidate's future expiry, so it's reliably within the cap regardless of DB growth.
 */
test("shows a verified candidate's license on the expiry timeline", async ({ page, request }) => {
  const name = `E2E License Candidate ${Date.now()}`;
  const candidateId = await createCandidate(request, name, "Clinical");
  await verifyLicense(request, candidateId, "Active", "2020-01-01");

  await page.goto("/license-verify");

  const link = page.getByRole("link", { name });
  await expect(link).toBeVisible();
  // The immediate parent `<div>` is the timeline row — it also holds the days-left label.
  const row = link.locator("xpath=..");
  await expect(row.getByText("EXPIRED")).toBeVisible();

  await link.click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
});
