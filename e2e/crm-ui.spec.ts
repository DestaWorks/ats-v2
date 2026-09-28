import { test, expect } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";
import { createClient } from "./fixtures/api";

/**
 * CRM driven the way an operator drives it. `crm-client`, `crm-deal` and `crm-task-meeting` assert
 * the same rules at the API, where they are enforced; these assert that the operator can carry them
 * out and is told when they cannot.
 */

async function openClient(page: import("@playwright/test").Page, name: string, id: string) {
  await gotoReady(page, `/crm/${id}`);
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
}

test("adds a client through the modal and lands on its page", async ({ page }) => {
  const name = `E2E UI Client ${Date.now()}`;

  await gotoReady(page, "/crm");
  await page.getByRole("button", { name: "+ Add client" }).click();
  await page.getByLabel(/^Name\*?$/).fill(name);
  await page.getByRole("button", { name: "Add Client", exact: true }).click();

  await expect(page.getByText(name).first()).toBeVisible();
});

test("refuses a client with no name at the field", async ({ page }) => {
  await gotoReady(page, "/crm");
  await page.getByRole("button", { name: "+ Add client" }).click();
  await page.getByRole("button", { name: "Add Client", exact: true }).click();

  // Client side zod stops the submit, so the operator is told at the field rather than by a toast.
  await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(page.getByRole("dialog").or(page.getByText("Add client")).first()).toBeVisible();
});

test("adds a contact, then refuses one with a malformed email", async ({ page, request }) => {
  const name = `E2E UI Contact Client ${Date.now()}`;
  const clientId = await createClient(request, name);
  await openClient(page, name, clientId);

  await page.getByRole("tab", { name: /Contacts/ }).click();
  await page.getByRole("button", { name: /Add contact/i }).click();

  const contactName = `E2E UI Contact ${Date.now()}`;
  await page.getByLabel(/^Full name\*?$/).fill(contactName);
  await page.getByLabel(/^Email\*?$/).fill("not-an-email");
  await page.getByRole("button", { name: /^Add contact$/i }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();

  await page.getByLabel(/^Email\*?$/).fill(`e2e-contact-${Date.now()}@example.com`);
  await page.getByRole("button", { name: /^Add contact$/i }).click();
  await expect(page.getByText(contactName).first()).toBeVisible();
});

test("adds a deal, and refuses one with no name", async ({ page, request }) => {
  const name = `E2E UI Deal Client ${Date.now()}`;
  const clientId = await createClient(request, name);
  await openClient(page, name, clientId);

  await page.getByRole("tab", { name: /^Deals/ }).click();
  await page.getByRole("button", { name: "+ Add Deal" }).click();

  await page.getByRole("button", { name: "Add Deal", exact: true }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();

  const dealName = `E2E UI Deal ${Date.now()}`;
  await page.getByLabel(/^Name\*?$/).fill(dealName);
  await page.getByRole("button", { name: "Add Deal", exact: true }).click();
  await expect(page.getByText(dealName).first()).toBeVisible();
});

test("adds a task, and refuses one with no title", async ({ page, request }) => {
  const name = `E2E UI Task Client ${Date.now()}`;
  const clientId = await createClient(request, name);
  await openClient(page, name, clientId);

  await page.getByRole("tab", { name: /^Tasks/ }).click();
  await page.getByRole("button", { name: "+ Add Task" }).click();

  await page.getByRole("button", { name: "Add Task", exact: true }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();

  const title = `E2E UI Task ${Date.now()}`;
  await page.getByLabel(/^Title\*?$/).fill(title);
  await page.getByRole("button", { name: "Add Task", exact: true }).click();
  await expect(page.getByText(title).first()).toBeVisible();
});

test("logs a meeting through its form", async ({ page, request }) => {
  const name = `E2E UI Meeting Client ${Date.now()}`;
  const clientId = await createClient(request, name);
  await openClient(page, name, clientId);

  await page.getByRole("tab", { name: /^Meetings/ }).click();
  await page.getByRole("button", { name: "+ Log Meeting" }).click();

  const notes = `E2E UI Meeting ${Date.now()}`;
  await page.getByLabel(/^Notes\*?$/).fill(notes);
  await page.getByRole("button", { name: "Log Meeting", exact: true }).click();

  await expect(page.getByText(notes).first()).toBeVisible();
});

/**
 * NOT COVERED here, deliberately. The API refuses a contact edit that changes nothing (422), but
 * the form seeds `defaultValues` from the existing contact and submits the whole payload, so an
 * untouched save sends a valid full update rather than an empty one. The refusal has no UI path;
 * `crm-client.spec.ts` is the only place it can be proven.
 */
