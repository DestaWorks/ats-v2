import { test, expect } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";
import { createCandidate } from "./fixtures/api";

test("the activity log records an action and shows it", async ({ page, request }) => {
  const name = `E2E Audit Subject ${Date.now()}`;
  await createCandidate(request, name, "Clinical");

  await gotoReady(page, "/activity");

  await expect(page.getByRole("heading", { name: "Activity log", level: 1 })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByText(name, { exact: false }).first()).toBeVisible();
});
