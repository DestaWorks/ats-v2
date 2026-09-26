import { test, expect } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";
import { createCandidate } from "./fixtures/api";

const ACTIVITY_API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3004";

test("the activity log records an action and shows it", async ({ page, request }) => {
  const name = `E2E Audit Subject ${Date.now()}`;
  await createCandidate(request, name, "Clinical");

  await gotoReady(page, "/activity");

  await expect(page.getByRole("heading", { name: "Activity log", level: 1 })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByText(name, { exact: false }).first()).toBeVisible();
});

test("refuses an activity filter on an action that does not exist", async ({ request }) => {
  const response = await request.get(`${ACTIVITY_API_BASE}/activity?action=teleported`);

  expect(response.status()).toBe(422);
});

test("refuses an activity filter with a malformed date", async ({ request }) => {
  const response = await request.get(`${ACTIVITY_API_BASE}/activity?from=not-a-date`);

  expect(response.status()).toBe(422);
});

test("answers 404 for an activity row that does not exist", async ({ request }) => {
  const response = await request.get(`${ACTIVITY_API_BASE}/activity/does-not-exist`);

  expect(response.status()).toBe(404);
});

test("offers the actors who have done something", async ({ request }) => {
  const response = await request.get(`${ACTIVITY_API_BASE}/activity/actor-options`);

  expect(response.ok()).toBeTruthy();
});
