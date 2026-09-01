import { test, expect } from "@playwright/test";

/**
 * CRM client lifecycle: create → edit a field → add a contact
 * (`apps/web/src/app/(app)/crm/add-client-modal.tsx`, `crm/[id]/client-detail.tsx`,
 * `crm/[id]/contacts-tab.tsx`). One test, one client fixture, to keep the flow's happy path in
 * a single readable trace rather than three specs redoing the create step.
 */
test("creates a client, edits a field, and adds a contact", async ({ page }) => {
  const name = `E2E Client ${Date.now()}`;

  await page.goto("/crm");
  // exact: true — CRM's own "+ Add client" trigger button substring-matches "Add Client" too.
  await page.getByRole("button", { name: "+ Add client" }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Add Client", exact: true }).click();

  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Primary contact").fill("Jordan Rivera");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Jordan Rivera")).toBeVisible();

  await page.getByRole("tab", { name: "Contacts" }).click();
  await page.getByRole("button", { name: "+ Add Contact" }).click();
  await page.getByLabel("Full name").fill("Sam Okafor");
  await page.getByRole("button", { name: "Add Contact", exact: true }).click();

  await expect(page.getByText("Sam Okafor")).toBeVisible();
});
