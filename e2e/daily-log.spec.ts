import { test, expect } from "@playwright/test";

/**
 * Submit today's daily log (`apps/web/src/app/(app)/daily-log/daily-log-view.tsx`). The server
 * enforces one submission per day (409 on a second `POST /api/daily/log`), but the client hides
 * the "Log Today's Numbers" trigger entirely once today's log exists — there's no UI path back
 * into the form to exercise that conflict, so this covers only the happy path.
 */
test("submits today's daily log", async ({ page }) => {
  await page.goto("/daily-log");
  await page.getByRole("button", { name: "Log Today's Numbers" }).click();
  await page.getByLabel("Outreach Sent").fill("12");
  await page.getByRole("button", { name: "Submit Daily Log" }).click();

  await expect(page.getByText("Today's log submitted")).toBeVisible();
  await expect(page.getByText("Outreach Sent: 12")).toBeVisible();
});
