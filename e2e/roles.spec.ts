import { test, expect } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";
import { createClient } from "./fixtures/api";

const ROLES_API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3004";

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

  await gotoReady(page, "/roles");
  await page.getByRole("button", { name: "+ Add role" }).click();
  await page.getByLabel("Target client").selectOption({ label: clientName });
  await page.getByLabel(/^Title\*?$/).fill(title);
  await page.getByRole("button", { name: "Add Role", exact: true }).click();

  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel(/^Title\*?$/).fill(updatedTitle);
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect(page.getByRole("heading", { name: updatedTitle, level: 1 })).toBeVisible();
});

test("refuses an open role with no title", async ({ request }) => {
  const response = await request.post(`${ROLES_API_BASE}/roles`, { data: { title: "  " } });

  expect(response.status()).toBe(422);
});

test("answers 404 for an open role that does not exist", async ({ request }) => {
  const response = await request.get(`${ROLES_API_BASE}/roles/does-not-exist`);

  expect(response.status()).toBe(404);
});

test("refuses an open role with an out-of-range opening count", async ({ request }) => {
  const response = await request.post(`${ROLES_API_BASE}/roles`, {
    data: { title: `E2E Openings ${Date.now()}`, openings: -3 },
  });

  expect(response.status()).toBe(422);
});
