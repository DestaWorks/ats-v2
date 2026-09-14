import { test, expect } from "@playwright/test";
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

  await page.goto("/templates");

  await page.getByRole("button", { name: "Sourced Lead" }).click();
  await page.getByPlaceholder("Search sourced lead by name...").fill(name);
  await page.getByRole("button", { name: new RegExp(name) }).click();

  await expect(page.getByText("SUBJECT")).toBeVisible();
  await page.getByRole("button", { name: "Copy All" }).click();
  await expect(page.getByRole("button", { name: "Copied!" })).toBeVisible();

  await page.goto("/sourcing");
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row.getByText("Outreach 1")).toBeVisible();
});
