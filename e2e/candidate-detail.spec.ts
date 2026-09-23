import { test, expect } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";
import { createCandidate } from "./fixtures/api";

const API_BASE_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3004";

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

  await gotoReady(page, `/candidates/${candidateId}`);

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

test("refuses a candidate with no name", async ({ request }) => {
  const response = await request.post(`${API_BASE_URL}/candidates`, { data: { name: "  " } });

  expect(response.status()).toBe(422);
});

test("refuses a candidate with a malformed email", async ({ request }) => {
  const response = await request.post(`${API_BASE_URL}/candidates`, {
    data: { name: `E2E Bad Email ${Date.now()}`, email: "not-an-email" },
  });

  expect(response.status()).toBe(422);
});

test("refuses an advance that the stage gate does not allow", async ({ request }) => {
  const id = await createCandidate(request, `E2E Gate ${Date.now()}`, "Clinical");

  const response = await request.post(`${API_BASE_URL}/candidates/${id}/move`, {
    data: { toStatus: "QUALIFIED_PRESCREEN" },
  });

  expect(response.status()).toBe(422);
  expect(await response.text()).toContain("Credential required");
});

test("answers 404 for a candidate that does not exist", async ({ request }) => {
  const response = await request.get(`${API_BASE_URL}/candidates/does-not-exist`);

  expect(response.status()).toBe(404);
});

test("refuses a note with no body", async ({ request }) => {
  const id = await createCandidate(request, `E2E Note ${Date.now()}`, "Operations");

  const response = await request.post(`${API_BASE_URL}/candidates/${id}/notes`, {
    data: { body: "  " },
  });

  expect(response.status()).toBe(422);
});

test("refuses a move to a status that does not exist", async ({ request }) => {
  const id = await createCandidate(request, `E2E Bad Status ${Date.now()}`, "Operations");

  const response = await request.post(`${API_BASE_URL}/candidates/${id}/move`, {
    data: { toStatus: "NOT_A_REAL_STATUS" },
  });

  expect(response.status()).toBe(422);
});
