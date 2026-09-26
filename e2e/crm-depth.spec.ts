import { test, expect } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";
import { createClient, createClientContact, generatePortalLink } from "./fixtures/api";

const DEPTH_API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3004";

test("renders the client comparison grid", async ({ page }) => {
  await gotoReady(page, "/crm/compare");

  await expect(page.locator("body")).not.toContainText("You don't have access");
  await expect(page.getByRole("heading").first()).toBeVisible();
});

test("loads health and revenue for a client", async ({ request }) => {
  const clientId = await createClient(request, `E2E Health Client ${Date.now()}`);

  const health = await request.get(`${DEPTH_API_BASE}/crm/clients/${clientId}/health`);
  expect(health.status()).toBe(200);

  const revenue = await request.get(`${DEPTH_API_BASE}/crm/clients/${clientId}/revenue`);
  expect(revenue.status()).toBe(200);
});

test("answers 404 for health on a client that does not exist", async ({ request }) => {
  const response = await request.get(`${DEPTH_API_BASE}/crm/clients/does-not-exist/health`);

  expect(response.status()).toBe(404);
});

test("adds a client note and reads it back from the notes list", async ({ request }) => {
  const clientId = await createClient(request, `E2E Note Client ${Date.now()}`);
  const text = `E2E client note ${Date.now()}`;

  const added = await request.post(`${DEPTH_API_BASE}/crm/clients/${clientId}/notes`, {
    data: { text },
  });
  expect(added.ok()).toBeTruthy();

  const listed = await request.get(`${DEPTH_API_BASE}/crm/clients/${clientId}/notes`);
  expect(listed.status()).toBe(200);
  const { notes } = (await listed.json()) as { notes: { text: string }[] };
  expect(notes.map((n) => n.text)).toContain(text);
});

test("lists the portal contacts for a client", async ({ request }) => {
  const clientId = await createClient(request, `E2E Portal List ${Date.now()}`);
  const contactName = `E2E Portal Contact ${Date.now()}`;
  await createClientContact(request, clientId, contactName);

  const response = await request.get(`${DEPTH_API_BASE}/crm/clients/${clientId}/portal/contacts`);
  expect(response.status()).toBe(200);
  const { contacts } = (await response.json()) as { contacts: { fullName: string }[] };
  expect(contacts.map((c) => c.fullName)).toContain(contactName);
});

test("revokes a portal token and the link stops working", async ({ request, browser }) => {
  const clientId = await createClient(request, `E2E Revoke Client ${Date.now()}`);
  const contactId = await createClientContact(
    request,
    clientId,
    `E2E Revoke Contact ${Date.now()}`,
  );
  const token = await generatePortalLink(request, clientId, contactId);

  const contacts = await request.get(`${DEPTH_API_BASE}/crm/clients/${clientId}/portal/contacts`);
  const { contacts: rows } = (await contacts.json()) as {
    contacts: { id: string; activeToken: { id: string } | null }[];
  };
  const tokenId = rows.find((c) => c.id === contactId)?.activeToken?.id;
  expect(tokenId, "the generated token is listed as active").toBeDefined();

  const revoked = await request.post(
    `${DEPTH_API_BASE}/crm/clients/${clientId}/portal/tokens/${tokenId}/revoke`,
  );
  expect(revoked.ok()).toBeTruthy();

  const visitor = await browser.newContext({});
  await visitor.addCookies([
    { name: "dw_tenant", value: "destaworks", url: "http://localhost:3007" },
  ]);
  const page = await visitor.newPage();
  await page.goto(`/portal/access?token=${encodeURIComponent(token)}`);

  await expect(page).toHaveURL(/\/portal\/request-access\?error=invalid_link/);
  await visitor.close();
});

test("refuses revoking a portal token that does not exist", async ({ request }) => {
  const clientId = await createClient(request, `E2E Revoke Missing ${Date.now()}`);

  const response = await request.post(
    `${DEPTH_API_BASE}/crm/clients/${clientId}/portal/tokens/does-not-exist/revoke`,
  );

  expect(response.status()).toBe(404);
});

test("loads the client comparison data", async ({ request }) => {
  const response = await request.get(`${DEPTH_API_BASE}/crm/compare`);

  expect(response.status()).toBe(200);
});
