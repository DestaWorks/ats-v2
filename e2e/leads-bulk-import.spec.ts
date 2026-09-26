import { test, expect } from "@playwright/test";
import { createLead } from "./fixtures/api";

const BULK_API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3004";

test("imports a batch of leads and they appear in the list", async ({ request }) => {
  const stamp = Date.now();
  const response = await request.post(`${BULK_API_BASE}/leads/import`, {
    data: {
      rows: [
        { name: `E2E Imported One ${stamp}`, email: `e2e-import-1-${stamp}@example.com` },
        { name: `E2E Imported Two ${stamp}`, state: "CA" },
      ],
    },
  });
  expect(response.ok()).toBeTruthy();

  const listed = await request.get(`${BULK_API_BASE}/leads/list?search=E2E Imported One ${stamp}`);
  expect(listed.status()).toBe(200);
});

test("refuses an import with no rows", async ({ request }) => {
  const response = await request.post(`${BULK_API_BASE}/leads/import`, { data: { rows: [] } });

  expect(response.status()).toBe(422);
});

test("refuses an import row with no name", async ({ request }) => {
  const response = await request.post(`${BULK_API_BASE}/leads/import`, {
    data: { rows: [{ name: "" }] },
  });

  expect(response.status()).toBe(422);
});

test("bulk-deletes leads and bulk-restores them", async ({ request }) => {
  const stamp = Date.now();
  const first = await createLead(request, `E2E Bulk One ${stamp}`);
  const second = await createLead(request, `E2E Bulk Two ${stamp}`);

  const deleted = await request.post(`${BULK_API_BASE}/leads/bulk`, {
    data: { action: "delete", ids: [first, second] },
  });
  expect(deleted.ok()).toBeTruthy();

  const restored = await request.post(`${BULK_API_BASE}/leads/bulk`, {
    data: { action: "restore", ids: [first, second] },
  });
  expect(restored.ok()).toBeTruthy();

  const detail = await request.get(`${BULK_API_BASE}/leads/${first}`);
  const { lead } = (await detail.json()) as { lead: { status: string } };
  expect(lead.status).not.toBe("deleted");
});

test("refuses a bulk action that does not exist", async ({ request }) => {
  const leadId = await createLead(request, `E2E Bulk Bad ${Date.now()}`);

  const response = await request.post(`${BULK_API_BASE}/leads/bulk`, {
    data: { action: "obliterate", ids: [leadId] },
  });

  expect(response.status()).toBe(422);
});

test("refuses a bulk action with no ids", async ({ request }) => {
  const response = await request.post(`${BULK_API_BASE}/leads/bulk`, {
    data: { action: "delete", ids: [] },
  });

  expect(response.status()).toBe(422);
});
