import { test, expect } from "@playwright/test";
import { createClient } from "./fixtures/api";

/**
 * CRM tasks + meetings: add a task, toggle it done, log a meeting
 * (`apps/web/src/app/(app)/crm/[id]/tasks-tab.tsx`, `meetings-tab.tsx`). One client fixture for
 * both — they're independent tabs on the same client detail page.
 */
test("adds a task, toggles it done, and logs a meeting", async ({ page, request }) => {
  const clientId = await createClient(request, `E2E Task Client ${Date.now()}`);
  const taskTitle = `E2E Task ${Date.now()}`;

  await page.goto(`/crm/${clientId}`);
  await page.getByRole("tab", { name: "Tasks" }).click();
  await page.getByRole("button", { name: "+ Add Task" }).click();
  await page.getByLabel("Title").fill(taskTitle);
  await page.getByRole("button", { name: "Add Task", exact: true }).click();

  const taskRow = page.locator("li").filter({ hasText: taskTitle });
  await expect(taskRow).toBeVisible();
  await taskRow.getByRole("button", { name: "Mark as done" }).click();
  await expect(taskRow.getByRole("button", { name: "Mark as open" })).toBeVisible();

  await page.getByRole("tab", { name: "Meetings" }).click();
  await page.getByRole("button", { name: "+ Log Meeting" }).click();
  await page.getByLabel("Notes").fill(`E2E meeting note ${Date.now()}`);
  await page.getByRole("button", { name: "Log Meeting", exact: true }).click();

  await expect(page.getByText(/E2E meeting note/)).toBeVisible();
});
