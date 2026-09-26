import { test, expect } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";
import { createCandidate, deleteCandidate, verifyLicense } from "./fixtures/api";

const LICENSE_API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3004";

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
 *
 * That last claim held only while ONE expired fixture existed. Repeated runs against a shared dev
 * DB left fourteen of them tied on the same expiry date, and `orderBy: licenseExpiry asc` then
 * returns an arbitrary twelve — so the newest fixture could miss the cap and the test failed on
 * accumulated data rather than on a real defect. The fixture is now removed at the end of the run.
 */
test("shows a verified candidate's license on the expiry timeline", async ({ page, request }) => {
  const name = `E2E License Candidate ${Date.now()}`;
  const candidateId = await createCandidate(request, name, "Clinical");
  await verifyLicense(request, candidateId, "Active", "2020-01-01");

  try {
    await gotoReady(page, "/license-verify");

    const link = page.getByRole("link", { name });
    await expect(link).toBeVisible();
    // The immediate parent `<div>` is the timeline row — it also holds the days-left label.
    const row = link.locator("xpath=..");
    await expect(row.getByText("EXPIRED")).toBeVisible();

    await link.click();
    await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  } finally {
    // Trashing the fixture keeps the timeline's twelve slots free for the next run. Without it,
    // every run left one more expired licence tied at the same date until the cap overflowed.
    await deleteCandidate(request, candidateId);
  }
});

test("refuses a licence status that does not exist", async ({ request }) => {
  const id = await createCandidate(request, `E2E Lic Status ${Date.now()}`, "Clinical");

  const response = await request.post(`${LICENSE_API_BASE}/candidates/${id}/verify-license`, {
    data: { licenseStatus: "Probably Fine" },
  });

  expect(response.status()).toBe(422);
});

test("refuses a licence expiry that is not a date", async ({ request }) => {
  const id = await createCandidate(request, `E2E Lic Expiry ${Date.now()}`, "Clinical");

  const response = await request.post(`${LICENSE_API_BASE}/candidates/${id}/verify-license`, {
    data: { licenseStatus: "Active", licenseExpiry: "not-a-date" },
  });

  expect(response.status()).toBe(422);
});

test("refuses verifying a licence for a candidate that does not exist", async ({ request }) => {
  const response = await request.post(
    `${LICENSE_API_BASE}/candidates/does-not-exist/verify-license`,
    { data: { licenseStatus: "Active" } },
  );

  expect(response.status()).toBe(404);
});

test("the verification dashboard renders", async ({ page }) => {
  await gotoReady(page, "/license-verify");

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
