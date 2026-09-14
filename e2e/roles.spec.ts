import { test, expect } from "@playwright/test";
import { createClient } from "./fixtures/api";

/**
 * Open role lifecycle: create → edit a field
 * (`apps/web/src/app/(app)/roles/add-role-modal.tsx`, `roles/[id]/role-detail.tsx`). A role
 * requires a `clientId` (`createOpenRoleSchema`), so this needs a client fixture first.
 */
test("creates a role and edits its title", async ({ page, request }) => {
  const clientName = `E2E Role Client ${Date.now()}`;
  await createClient(request, clientName);
  const title = `E2E Role ${Date.now()}`;
  const updatedTitle = `${title} (Updated)`;

  await page.goto("/roles");
  await page.getByRole("button", { name: "+ Add role" }).click();
  await page.getByLabel("Target client").selectOption({ label: clientName });
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Add Role", exact: true }).click();

  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill(updatedTitle);
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect(page.getByRole("heading", { name: updatedTitle, level: 1 })).toBeVisible();
});
