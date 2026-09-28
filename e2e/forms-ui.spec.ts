import { test, expect } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";
import { createClient } from "./fixtures/api";

/**
 * The remaining operator forms, driven rather than posted: roles, sourcing, admin and workspace.
 * Each covers the positive path and the refusal the operator meets when a required field is empty.
 */

test("adds an open role, and refuses one with no title", async ({ page, request }) => {
  await createClient(request, `E2E UI Role Client ${Date.now()}`);

  await gotoReady(page, "/roles");
  await page.getByRole("button", { name: "+ Add role" }).click();

  await page.getByRole("button", { name: "Add Role", exact: true }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();

  const title = `E2E UI Role ${Date.now()}`;
  await page.getByLabel(/^Target client\*?$/).selectOption({ index: 1 });
  await page.getByLabel(/^Title\*?$/).fill(title);
  await page.getByRole("button", { name: "Add Role", exact: true }).click();

  await expect(page.getByText(title).first()).toBeVisible();
});

test("adds a source lead, and refuses one with no name", async ({ page }) => {
  await gotoReady(page, "/sourcing");
  await page.getByRole("button", { name: "+ Add lead" }).click();

  await page.getByRole("button", { name: "Add Lead", exact: true }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();

  const name = `E2E UI Lead ${Date.now()}`;
  await page.getByLabel(/^Name\*?$/).fill(name);
  await page.getByRole("button", { name: "Add Lead", exact: true }).click();

  await expect(page.getByText(name).first()).toBeVisible();
});

test("adds a user from the admin panel, and refuses one with no name", async ({ page }) => {
  await gotoReady(page, "/admin");
  await page.getByRole("button", { name: "+ Add User" }).click();

  await page.getByRole("button", { name: "Add User", exact: true }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();

  const email = `e2e-ui-user-${Date.now()}@example.com`;
  await page.getByLabel(/^Name\*?$/).fill(`E2E UI User ${Date.now()}`);
  await page.getByLabel(/^Email\*?$/).fill(email);
  await page.getByRole("button", { name: "Add User", exact: true }).click();

  await expect(page.getByText(email).first()).toBeVisible();
});

test("refuses a workspace invitation with no email, at the field", async ({ page }) => {
  await gotoReady(page, "/workspace");
  await page.getByRole("button", { name: "Invite member", exact: true }).click();

  await expect(page.getByRole("button", { name: "Send invitation", exact: true })).toBeDisabled();
});

test("refuses a malformed email when adding a user, at the field", async ({ page }) => {
  await gotoReady(page, "/admin");
  await page.getByRole("button", { name: "+ Add User" }).click();
  await page.getByLabel(/^Name\*?$/).fill(`E2E UI Bad User ${Date.now()}`);
  await page.getByLabel(/^Email\*?$/).fill("not-an-email");
  await page.getByRole("button", { name: "Add User", exact: true }).click();

  await expect(page.getByRole("alert").first()).toBeVisible();
});

test("keeps the bulk move disabled until candidates are selected", async ({ page }) => {
  await gotoReady(page, "/candidates");

  // The empty-id-list refusal the API asserts is unreachable here by design: the control that
  // would send it cannot be used until something is selected.
  await expect(page.getByRole("button", { name: "Move", exact: true })).toHaveCount(0);
});
