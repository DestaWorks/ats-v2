import { test, expect } from "@playwright/test";

const EXPORT_API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3004";

test("exports the candidate report as CSV", async ({ request }) => {
  const response = await request.get(`${EXPORT_API_BASE}/reports/export`);

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/csv");
  expect(await response.text()).not.toBe("");
});

test("refuses to queue an export when no job queue is configured", async ({ request }) => {
  const response = await request.post(`${EXPORT_API_BASE}/reports/export/jobs`);

  // No queue driver runs in the harness, so the enqueue fails and the export is marked failed
  // rather than left pending. See the environment note in E2E-AUDIT-ROUND-2.md.
  expect(response.status()).toBe(503);
});

test("answers 404 for an export job that does not exist", async ({ request }) => {
  const response = await request.get(`${EXPORT_API_BASE}/reports/export/jobs/does-not-exist`);

  expect(response.status()).toBe(404);
});

test("refuses an export filtered on a malformed date", async ({ request }) => {
  const response = await request.get(`${EXPORT_API_BASE}/reports/export?addedFrom=not-a-date`);

  expect(response.status()).toBe(422);
});
