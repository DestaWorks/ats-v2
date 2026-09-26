import { test, expect, request as playwrightRequest } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import { createClient } from "./fixtures/api";

const PR_API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3004";

async function submitPortalRequest(email: string, clientName: string): Promise<number> {
  const anonymous = await playwrightRequest.newContext();
  const response = await anonymous.post(`${PR_API_BASE}/portal/access-requests`, {
    data: {
      name: "E2E Portal Requester",
      email,
      requestedClientName: clientName,
      note: "E2E portal access request",
    },
    headers: { "x-forwarded-host": "destaworks.localhost" },
  });
  const status = response.status();
  await anonymous.dispose();
  return status;
}

async function portalQueue(request: APIRequestContext): Promise<{ id: string; email: string }[]> {
  const response = await request.get(`${PR_API_BASE}/admin/portal/requests`);
  expect(response.ok(), "GET /admin/portal/requests").toBeTruthy();
  const { requests } = (await response.json()) as { requests: { id: string; email: string }[] };
  return requests;
}

test("takes a portal access request from a client contact with no link", async ({ request }) => {
  const email = `e2e-portal-req-${Date.now()}@example.com`;

  expect(await submitPortalRequest(email, "E2E Requested Clinic")).toBe(201);

  expect((await portalQueue(request)).map((r) => r.email)).toContain(email);
});

test("approves a portal request against a real client", async ({ request }) => {
  const email = `e2e-portal-approve-${Date.now()}@example.com`;
  expect(await submitPortalRequest(email, "E2E Approve Clinic")).toBe(201);
  const pending = (await portalQueue(request)).find((r) => r.email === email);
  expect(pending, `no queued portal request for ${email}`).toBeDefined();

  const clientId = await createClient(request, `E2E Portal Approve Client ${Date.now()}`);
  const approved = await request.post(
    `${PR_API_BASE}/admin/portal/requests/${pending!.id}/approve`,
    { data: { clientId } },
  );

  expect(approved.status()).toBe(200);
});

test("declines a portal request", async ({ request }) => {
  const email = `e2e-portal-decline-${Date.now()}@example.com`;
  expect(await submitPortalRequest(email, "E2E Decline Clinic")).toBe(201);
  const pending = (await portalQueue(request)).find((r) => r.email === email);

  const declined = await request.post(
    `${PR_API_BASE}/admin/portal/requests/${pending!.id}/decline`,
  );

  expect(declined.status()).toBe(200);
});

test("refuses a portal request with no client named", async ({ request }) => {
  const response = await request.post(`${PR_API_BASE}/portal/access-requests`, {
    data: { name: "E2E No Client", email: "e2e@example.com", requestedClientName: "" },
  });

  expect(response.status()).toBe(422);
});

test("refuses approving a portal request onto no client", async ({ request }) => {
  const response = await request.post(
    `${PR_API_BASE}/admin/portal/requests/does-not-exist/approve`,
    { data: { clientId: "" } },
  );

  expect(response.status()).toBe(422);
});
