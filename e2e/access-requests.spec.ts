import { test, expect, request as playwrightRequest } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";

const REQ_API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3004";
const REQ_WEB_BASE = "http://localhost:3007";

async function submitRequest(name: string, email: string): Promise<number> {
  const anonymous = await playwrightRequest.newContext();
  const response = await anonymous.post(`${REQ_API_BASE}/access-requests`, {
    data: { name, email, organization: "E2E Clinic", message: "E2E access request" },
    headers: { "x-forwarded-host": "destaworks.localhost" },
  });
  const status = response.status();
  await anonymous.dispose();
  return status;
}

async function queue(
  request: APIRequestContext,
): Promise<{ id: string; email: string; status: string }[]> {
  const response = await request.get(`${REQ_API_BASE}/admin/access-requests`);
  expect(response.ok(), "GET /admin/access-requests").toBeTruthy();
  const { requests } = (await response.json()) as {
    requests: { id: string; email: string; status: string }[];
  };
  return requests;
}

async function roleIdNamed(request: APIRequestContext, name: string): Promise<string> {
  const response = await request.get(`${REQ_API_BASE}/tenants/roles`);
  const { roles } = (await response.json()) as { roles: { id: string; name: string }[] };
  return roles.find((role) => role.name === name)!.id;
}

test("renders the request-access form", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();

  await gotoReady(page, "/request-access");

  await expect(page.getByLabel("Full name *")).toBeVisible();
  await expect(page.getByLabel("Email *")).toBeVisible();
  await context.close();
});

test("takes a request from an applicant with no account and queues it", async ({ request }) => {
  const email = `e2e-applicant-${Date.now()}@example.com`;

  expect(await submitRequest("E2E Applicant", email)).toBe(201);

  expect((await queue(request)).map((r) => r.email)).toContain(email);
});

test("approves a request into an account that can sign in", async ({ request }) => {
  const email = `e2e-approved-${Date.now()}@example.com`;
  expect(await submitRequest("E2E Approved Applicant", email)).toBe(201);

  const pending = (await queue(request)).find((r) => r.email === email);
  expect(pending, `no queued request for ${email}`).toBeDefined();

  const approved = await request.post(
    `${REQ_API_BASE}/admin/access-requests/${pending!.id}/approve`,
    { data: { roleId: await roleIdNamed(request, "Associate") } },
  );
  expect(approved.ok()).toBeTruthy();
  const { generatedPassword } = (await approved.json()) as { generatedPassword: string };

  const applicant = await playwrightRequest.newContext();
  const signIn = await applicant.post(`${REQ_WEB_BASE}/api/auth/sign-in/email`, {
    data: { email, password: generatedPassword },
    headers: { origin: REQ_WEB_BASE },
  });
  expect(signIn.ok(), "the approved applicant can sign in").toBeTruthy();
  await applicant.dispose();
});

test("declines a request and leaves no account behind", async ({ request }) => {
  const email = `e2e-declined-${Date.now()}@example.com`;
  expect(await submitRequest("E2E Declined Applicant", email)).toBe(201);

  const pending = (await queue(request)).find((r) => r.email === email);
  const declined = await request.post(
    `${REQ_API_BASE}/admin/access-requests/${pending!.id}/decline`,
  );
  expect(declined.ok()).toBeTruthy();

  const users = await request.get(`${REQ_API_BASE}/admin/users`);
  const { users: roster } = (await users.json()) as { users: { email: string }[] };
  expect(roster.map((u) => u.email)).not.toContain(email);
});

test("refuses a request with a malformed email", async ({ request }) => {
  const response = await request.post(`${REQ_API_BASE}/access-requests`, {
    data: { name: "E2E Bad Email", email: "not-an-email" },
  });

  expect(response.status()).toBe(422);
});

test("refuses approving a request that does not exist", async ({ request }) => {
  const response = await request.post(
    `${REQ_API_BASE}/admin/access-requests/does-not-exist/approve`,
    { data: { roleId: await roleIdNamed(request, "Associate") } },
  );

  expect(response.status()).toBe(404);
});
