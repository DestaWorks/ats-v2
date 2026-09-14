import { test, expect } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";

/**
 * Submit today's daily log (`apps/web/src/app/(app)/daily-log/daily-log-view.tsx`). The server
 * enforces one submission per day (409 on a second `POST /api/daily/log`), and the client hides
 * the "Log Today's Numbers" trigger entirely once today's log exists — there's no UI path back
 * into the form to exercise that conflict, so this covers only the happy path.
 *
 * That makes the form reachable exactly once per day per database. CI builds a throwaway Postgres
 * per run and always takes the submitting branch; a persistent local database will already carry
 * today's row on a re-run, where the only thing left to assert is the submitted state.
 */
test("submits today's daily log", async ({ page }) => {
  await gotoReady(page, "/daily-log");

  const trigger = page.getByRole("button", { name: "Log Today's Numbers" });
  const submitted = page.getByText(/Outreach Sent: \d+/);
  await expect(trigger.or(submitted).first()).toBeVisible();

  if ((await trigger.count()) === 0) {
    await expect(submitted.first()).toBeVisible();
    return;
  }

  await trigger.click();
  await page.getByLabel("Outreach Sent").fill("12");
  await page.getByRole("button", { name: "Submit Daily Log" }).click();

  await expect(page.getByText("Today's log submitted")).toBeVisible();
  await expect(page.getByText("Outreach Sent: 12")).toBeVisible();
});
