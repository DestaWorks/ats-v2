import { test, expect } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";
import { createClient } from "./fixtures/api";

const API_BASE_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3004";

/**
 * CRM client lifecycle: create → edit a field → add a contact
 * (`apps/web/src/app/(app)/crm/add-client-modal.tsx`, `crm/[id]/client-detail.tsx`,
 * `crm/[id]/contacts-tab.tsx`). One test, one client fixture, to keep the flow's happy path in
 * a single readable trace rather than three specs redoing the create step.
 */
test("creates a client, edits a field, and adds a contact", async ({ page }) => {
  const name = `E2E Client ${Date.now()}`;

  await gotoReady(page, "/crm");
  // exact: true — CRM's own "+ Add client" trigger button substring-matches "Add Client" too.
  await page.getByRole("button", { name: "+ Add client" }).click();
  await page.getByLabel(/^Name\*?$/).fill(name);
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

test("refuses a client with no name", async ({ request }) => {
  const response = await request.post(`${API_BASE_URL}/crm/clients`, { data: { name: "  " } });

  expect(response.status()).toBe(422);
});

test("answers 404 for a client that does not exist", async ({ request }) => {
  const response = await request.get(`${API_BASE_URL}/crm/clients/does-not-exist`);

  expect(response.status()).toBe(404);
});

test("refuses a contact on a client that does not exist", async ({ request }) => {
  const response = await request.post(`${API_BASE_URL}/crm/clients/does-not-exist/contacts`, {
    data: { fullName: "E2E Ghost" },
  });

  expect([404, 422]).toContain(response.status());
});

test("refuses a client with an out-of-range capacity", async ({ request }) => {
  const response = await request.post(`${API_BASE_URL}/crm/clients`, {
    data: { name: `E2E Capacity ${Date.now()}`, capacity: 999999 },
  });

  expect(response.status()).toBe(422);
});

test("refuses a contact with a malformed email", async ({ request }) => {
  const clientId = await createClient(request, `E2E Contact Client ${Date.now()}`);

  const response = await request.post(`${API_BASE_URL}/crm/clients/${clientId}/contacts`, {
    data: { fullName: "E2E Contact", email: "not-an-email" },
  });

  expect(response.status()).toBe(422);
});

test("refuses a note with no body on a client", async ({ request }) => {
  const clientId = await createClient(request, `E2E Note Client ${Date.now()}`);

  const response = await request.post(`${API_BASE_URL}/crm/clients/${clientId}/notes`, {
    data: { text: "  " },
  });

  expect(response.status()).toBe(422);
});

async function clientDetail(
  request: import("@playwright/test").APIRequestContext,
  clientId: string,
): Promise<{
  client: { name: string };
  contacts: { id: string; fullName: string; status: string }[];
  tasks: { id: string }[];
  meetings: { id: string }[];
  deals: { id: string; name: string; stage: string }[];
}> {
  const response = await request.get(`${API_BASE_URL}/crm/clients/${clientId}`);
  expect(response.ok(), `GET /crm/clients/${clientId}`).toBeTruthy();
  return await response.json();
}

test("edits a client and keeps the change", async ({ request }) => {
  const clientId = await createClient(request, `E2E Edit Client ${Date.now()}`);
  const renamed = `E2E Renamed Client ${Date.now()}`;

  const patched = await request.patch(`${API_BASE_URL}/crm/clients/${clientId}`, {
    data: { name: renamed },
  });
  expect(patched.ok()).toBeTruthy();

  expect((await clientDetail(request, clientId)).client.name).toBe(renamed);
});

test("deletes a client contact and leaves the roster", async ({ request }) => {
  const clientId = await createClient(request, `E2E Contact Delete ${Date.now()}`);
  const added = await request.post(`${API_BASE_URL}/crm/clients/${clientId}/contacts`, {
    data: { fullName: "E2E Doomed Contact", role: "gatekeeper" },
  });
  expect(added.ok()).toBeTruthy();
  const { contact } = (await added.json()) as { contact: { id: string } };

  const deleted = await request.delete(
    `${API_BASE_URL}/crm/clients/${clientId}/contacts/${contact.id}`,
  );
  expect(deleted.ok()).toBeTruthy();

  const after = await clientDetail(request, clientId);
  expect(after.contacts.map((c) => c.id)).not.toContain(contact.id);
});

test("edits a client contact and marks them departed", async ({ request }) => {
  const clientId = await createClient(request, `E2E Contact Edit ${Date.now()}`);
  const added = await request.post(`${API_BASE_URL}/crm/clients/${clientId}/contacts`, {
    data: { fullName: "E2E Original Name", role: "unknown" },
  });
  const { contact } = (await added.json()) as { contact: { id: string } };

  const renamed = await request.patch(
    `${API_BASE_URL}/crm/clients/${clientId}/contacts/${contact.id}`,
    { data: { fullName: "E2E Updated Name", title: "Director of Nursing" } },
  );
  expect(renamed.ok()).toBeTruthy();

  const departed = await request.patch(
    `${API_BASE_URL}/crm/clients/${clientId}/contacts/${contact.id}`,
    { data: { status: "left" } },
  );
  expect(departed.ok()).toBeTruthy();

  const after = (await clientDetail(request, clientId)).contacts.find((c) => c.id === contact.id);
  expect(after?.fullName).toBe("E2E Updated Name");
  expect(after?.status).toBe("left");
});

test("refuses a contact edit that changes nothing", async ({ request }) => {
  const clientId = await createClient(request, `E2E Empty Patch ${Date.now()}`);
  const added = await request.post(`${API_BASE_URL}/crm/clients/${clientId}/contacts`, {
    data: { fullName: "E2E No-op Contact" },
  });
  const { contact } = (await added.json()) as { contact: { id: string } };

  const response = await request.patch(
    `${API_BASE_URL}/crm/clients/${clientId}/contacts/${contact.id}`,
    { data: {} },
  );

  expect(response.status()).toBe(422);
});
