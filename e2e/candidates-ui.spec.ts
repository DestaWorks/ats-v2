import { test, expect } from "@playwright/test";
import { gotoReady, openDetailPage } from "./fixtures/navigate";
import { createCandidate } from "./fixtures/api";

/**
 * The candidate screens driven the way an operator drives them. `candidate-detail` asserts the same
 * rules at the API; these assert the operator can carry them out and is told when they cannot.
 */

async function openCandidate(page: import("@playwright/test").Page, name: string, id: string) {
  await openDetailPage(page, `/candidates/${id}`, name);
}

test("adds a candidate through the form and lands on their page", async ({ page }) => {
  const name = `E2E UI Candidate ${Date.now()}`;

  await gotoReady(page, "/candidates/new");
  await page.getByLabel(/^Full Name\*?$/).fill(name);
  await page.getByLabel(/^Track\*?$/).selectOption("Operations");
  await page.getByLabel(/^Email$/).fill(`e2e-ui-${Date.now()}@example.com`);
  await page.getByRole("button", { name: "Add Candidate", exact: true }).click();

  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
});

test("edits a candidate through the Details form and the change survives a reload", async ({
  page,
  request,
}) => {
  const name = `E2E UI Edit ${Date.now()}`;
  const id = await createCandidate(request, name);
  await openCandidate(page, name, id);

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel(/^City$/).fill("Sacramento");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();

  await gotoReady(page, `/candidates/${id}`);
  await expect(page.getByText("Sacramento").first()).toBeVisible();
});

test("refuses an edit that blanks the name, at the field", async ({ page, request }) => {
  const name = `E2E UI Blank ${Date.now()}`;
  const id = await createCandidate(request, name);
  await openCandidate(page, name, id);

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel(/^Name\*?$/).fill("");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();

  await expect(page.getByRole("alert").first()).toBeVisible();
});

test("changes a candidate's track from the header, inline", async ({ page, request }) => {
  const name = `E2E UI Track ${Date.now()}`;
  const id = await createCandidate(request, name);
  await openCandidate(page, name, id);

  const track = page.locator("select").first();
  await expect(track).toBeVisible();
  await track.selectOption("Clinical");

  // The pill is a styled <select>, so its option text is not "visible" — the value is the fact.
  await expect(track).toHaveValue("Clinical");
  await gotoReady(page, `/candidates/${id}`);
  await expect(page.locator("select").first()).toHaveValue("Clinical");
});

test("adds a note, and refuses an empty one", async ({ page, request }) => {
  const name = `E2E UI Note ${Date.now()}`;
  const id = await createCandidate(request, name);
  await openCandidate(page, name, id);

  await page.getByRole("tab", { name: /^Notes/ }).click();
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();

  const body = `E2E UI note ${Date.now()}`;
  await page.getByLabel(/^Add a note\*?$/).fill(body);
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  await expect(page.getByText(body).first()).toBeVisible();
});

test("logs outreach against a candidate", async ({ page, request }) => {
  const name = `E2E UI Outreach ${Date.now()}`;
  const id = await createCandidate(request, name);
  await openCandidate(page, name, id);

  await page.getByRole("tab", { name: /^Outreach/ }).click();
  const note = `E2E UI outreach ${Date.now()}`;
  await page.getByLabel(/^Note \(optional\)$/).fill(note);
  await page.getByRole("button", { name: "Log outreach", exact: true }).click();

  await expect(page.getByText(note).first()).toBeVisible();
});

test("refuses a malformed email on the add form, at the field", async ({ page }) => {
  await gotoReady(page, "/candidates/new");
  await page.getByLabel(/^Full Name\*?$/).fill(`E2E UI Bad Email ${Date.now()}`);
  await page.getByLabel(/^Track\*?$/).selectOption("Operations");
  await page.getByLabel(/^Email$/).fill("not-an-email");
  await page.getByRole("button", { name: "Add Candidate", exact: true }).click();

  await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(page).toHaveURL(/\/candidates\/new/);
});

test("refuses years of experience beyond the allowed range, at the field", async ({
  page,
  request,
}) => {
  const name = `E2E UI Years ${Date.now()}`;
  const id = await createCandidate(request, name);
  await openCandidate(page, name, id);

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel(/^Years experience$/).fill("999");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();

  await expect(page.getByRole("alert").first()).toBeVisible();
});
