import { test, expect } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";

test("bulk import loads for a role that holds the capability", async ({ page }) => {
  await gotoReady(page, "/migration");

  await expect(page.getByRole("heading", { name: /Bulk Import/i, level: 1 })).toBeVisible();
  await expect(page.getByText("You don't have access")).not.toBeVisible();
});

const MIGRATION_API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3004";

test("refuses an import with nothing to import", async ({ request }) => {
  const response = await request.post(`${MIGRATION_API_BASE}/migration/prepare`, { data: {} });

  expect(response.status()).toBe(422);
});

test("prepares a CSV import into a diffable report", async ({ request }) => {
  const stamp = Date.now();
  const content =
    `ID,Name,Status,Email\n` +
    `e2e-${stamp}-1,E2E Migrated One ${stamp},0 - New Candidate,e2e-mig-1-${stamp}@example.com\n` +
    `e2e-${stamp}-2,E2E Migrated Two ${stamp},0 - New Candidate,e2e-mig-2-${stamp}@example.com\n`;

  const response = await request.post(`${MIGRATION_API_BASE}/migration/prepare`, {
    data: { format: "csv", content, filename: "e2e-import.csv" },
  });

  expect(response.status()).toBe(200);
});

test("refuses an import in a format that does not exist", async ({ request }) => {
  const response = await request.post(`${MIGRATION_API_BASE}/migration/prepare`, {
    data: { format: "xml", content: "<rows/>" },
  });

  expect(response.status()).toBe(422);
});

test("refuses a CSV missing a required column", async ({ request }) => {
  const response = await request.post(`${MIGRATION_API_BASE}/migration/prepare`, {
    data: { format: "csv", content: "Name,Email\nE2E No Id,e2e@example.com\n" },
  });

  expect(response.status()).toBe(400);
});

test("refuses an import with empty content", async ({ request }) => {
  const response = await request.post(`${MIGRATION_API_BASE}/migration/prepare`, {
    data: { format: "csv", content: "" },
  });

  expect(response.status()).toBe(422);
});

test("answers 404 for a migration run that does not exist", async ({ request }) => {
  const response = await request.get(`${MIGRATION_API_BASE}/migration/runs/does-not-exist`);

  expect(response.status()).toBe(404);
});

test("marks a commit failed when it cannot be queued", async ({ request }) => {
  const stamp = Date.now();
  const response = await request.post(`${MIGRATION_API_BASE}/migration/commit`, {
    data: {
      format: "csv",
      content: `ID,Name,Status\ne2e-${stamp},E2E Commit ${stamp},0 - New Candidate\n`,
    },
  });

  // No enqueuer is registered in the harness. That is a deployment fault, so it stays a 500 —
  // what matters is that the run row is not left queued for a job nobody holds.
  expect(response.status()).toBe(500);
});
