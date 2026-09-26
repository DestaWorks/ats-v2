import { test, expect } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";
import { createLead } from "./fixtures/api";

/**
 * Templates (`apps/web/src/app/(app)/templates/templates-workspace.tsx`) — pick a template, pick a
 * recipient, send. "Copy All" both writes to the clipboard AND logs the send as an outreach attempt
 * (`logSent()`) — that outreach write is the one server-observable effect of "sending", so this
 * spec verifies it landed on the Sourcing board rather than asserting clipboard contents (which
 * needs a granted browser permission the other specs don't rely on).
 */
test("picks a template, sends to a sourced lead, and logs the outreach", async ({
  page,
  request,
}) => {
  const name = `E2E Template Lead ${Date.now()}`;
  await createLead(request, name);

  await gotoReady(page, "/templates");

  await page.getByRole("button", { name: "Sourced Lead" }).click();
  await page.getByPlaceholder("Search sourced lead by name...").fill(name);
  await page.getByRole("button", { name: new RegExp(name) }).click();

  await expect(page.getByText("SUBJECT")).toBeVisible();
  await page.getByRole("button", { name: "Copy All" }).click();
  await expect(page.getByRole("button", { name: "Copied!" })).toBeVisible();

  await gotoReady(page, "/sourcing");
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row.getByText("Outreach 1")).toBeVisible();
});

test("shows the preview with its subject and body", async ({ page }) => {
  await gotoReady(page, "/templates");

  await expect(page.getByText("Preview")).toBeVisible();
  await expect(page.getByText("SUBJECT")).toBeVisible();
  await expect(page.getByText("BODY")).toBeVisible();
});

test("tells the user when a recipient search matches nothing", async ({ page }) => {
  await gotoReady(page, "/templates");

  await page.getByPlaceholder("Search candidate name...").fill("zzz-no-such-candidate-zzz");

  await expect(page.getByText("No matches")).toBeVisible();
});

const TEMPLATES_API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3004";

test("loads template performance figures", async ({ request }) => {
  const response = await request.get(`${TEMPLATES_API_BASE}/templates/performance`);

  expect(response.status()).toBe(200);
});
