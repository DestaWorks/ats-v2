import { test, expect } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";
import { createCandidate, deleteCandidate } from "./fixtures/api";

const TRASH_API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3004";

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

  await gotoReady(page, "/trash");
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: "Restore" }).click();
  await expect(row).not.toBeVisible();
});

test("refuses restoring a candidate that is not in the trash", async ({ request }) => {
  const id = await createCandidate(request, `E2E Not Trashed ${Date.now()}`, "Operations");

  const response = await request.post(`${TRASH_API_BASE}/candidates/${id}/restore`, { data: {} });

  expect(response.status()).toBe(409);
});

test("answers 404 when purging a candidate that does not exist", async ({ request }) => {
  const response = await request.post(`${TRASH_API_BASE}/candidates/does-not-exist/purge`, {
    data: {},
  });

  expect(response.status()).toBe(404);
});

test("a purged candidate does not come back", async ({ request }) => {
  const id = await createCandidate(request, `E2E Purge ${Date.now()}`, "Operations");
  await deleteCandidate(request, id);

  const purged = await request.post(`${TRASH_API_BASE}/candidates/${id}/purge`, { data: {} });
  expect(purged.ok()).toBeTruthy();

  const after = await request.get(`${TRASH_API_BASE}/candidates/${id}`);
  expect(after.status()).toBe(404);
});

test("refuses purging a candidate that is still live", async ({ request }) => {
  const id = await createCandidate(request, `E2E Live Purge ${Date.now()}`, "Operations");

  const response = await request.post(`${TRASH_API_BASE}/candidates/${id}/purge`, { data: {} });

  expect(response.status()).toBe(409);
});
