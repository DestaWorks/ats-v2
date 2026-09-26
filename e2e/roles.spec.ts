import { test, expect } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";
import { createClient, createRole } from "./fixtures/api";

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

test("refuses an open role with no client", async ({ request }) => {
  const response = await request.post(`${ROLES_API_BASE}/roles`, {
    data: { title: `E2E No Client ${Date.now()}` },
  });

  expect(response.status()).toBe(422);
});

test("refuses an open role with a priority that does not exist", async ({ request }) => {
  const clientId = await createClient(request, `E2E Priority Client ${Date.now()}`);

  const response = await request.post(`${ROLES_API_BASE}/roles`, {
    data: { clientId, title: `E2E Priority ${Date.now()}`, priority: "P99" },
  });

  expect(response.status()).toBe(422);
});

async function roleDetail(
  request: import("@playwright/test").APIRequestContext,
  roleId: string,
): Promise<{ role: { title: string; priority: string; notes: { id: string; body: string }[] } }> {
  const response = await request.get(`${ROLES_API_BASE}/roles/${roleId}`);
  expect(response.ok(), `GET /roles/${roleId}`).toBeTruthy();
  return await response.json();
}

async function seedRole(
  request: import("@playwright/test").APIRequestContext,
  label: string,
): Promise<string> {
  const clientId = await createClient(request, `E2E ${label} Client ${Date.now()}`);
  return await createRole(request, clientId, `E2E ${label} Role ${Date.now()}`);
}

test("edits an open role and keeps the change", async ({ request }) => {
  const roleId = await seedRole(request, "Role Edit");
  const renamed = `E2E Renamed Role ${Date.now()}`;

  const patched = await request.patch(`${ROLES_API_BASE}/roles/${roleId}`, {
    data: { title: renamed, priority: "P1" },
  });
  expect(patched.ok()).toBeTruthy();

  const { role } = await roleDetail(request, roleId);
  expect(role.title).toBe(renamed);
  expect(role.priority).toBe("P1");
});

test("adds a note to a role and deletes it again", async ({ request }) => {
  const roleId = await seedRole(request, "Role Note");

  const added = await request.post(`${ROLES_API_BASE}/roles/${roleId}/notes`, {
    data: { body: "E2E role note", category: "General" },
  });
  expect(added.ok()).toBeTruthy();

  const note = (await roleDetail(request, roleId)).role.notes.find(
    (n) => n.body === "E2E role note",
  );
  expect(note, "the note is readable back on the role").toBeDefined();

  const deleted = await request.delete(`${ROLES_API_BASE}/roles/${roleId}/notes/${note!.id}`);
  expect(deleted.ok()).toBeTruthy();

  expect((await roleDetail(request, roleId)).role.notes.map((n) => n.id)).not.toContain(note!.id);
});

test("deletes an open role and it stops resolving", async ({ request }) => {
  const roleId = await seedRole(request, "Role Delete");

  const deleted = await request.delete(`${ROLES_API_BASE}/roles/${roleId}`);
  expect(deleted.ok()).toBeTruthy();

  const after = await request.get(`${ROLES_API_BASE}/roles/${roleId}`);
  expect(after.status()).toBe(404);
});

test("refuses a role note with no body", async ({ request }) => {
  const roleId = await seedRole(request, "Role Note Empty");

  const response = await request.post(`${ROLES_API_BASE}/roles/${roleId}/notes`, {
    data: { body: "" },
  });

  expect(response.status()).toBe(422);
});

test("loads the dormant matches for a role", async ({ request }) => {
  const roleId = await seedRole(request, "Dormant");

  const response = await request.get(`${ROLES_API_BASE}/roles/${roleId}/dormant-matches`);

  expect(response.status()).toBe(200);
});
