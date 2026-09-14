import { test, expect } from "@playwright/test";
import { createCandidate, moveCandidateStatus } from "./fixtures/api";

/**
 * Screening (`apps/web/src/app/(app)/screening/screening-view.tsx`) — pick a candidate from the
 * picker (scoped server-side to `SCREENING_ELIGIBLE_STATUSES`), fill part of the scorecard, save.
 * Every scorecard field is optional (`saveScreeningSchema`), so this only exercises Save — the
 * conditional Advance/Move-to-Future-Pipeline buttons depend on a computed score crossing a
 * threshold, which isn't worth pinning to exact section weights here.
 *
 * Operations track + an email: `QUALIFIED_PRESCREEN`'s stage gate needs contact info for
 * Operations candidates (`stage-gates.ts`), same reasoning as `candidate-pipeline.spec.ts`.
 */
test("scores a candidate and saves the scorecard", async ({ page, request }) => {
  const name = `E2E Screening Candidate ${Date.now()}`;
  const candidateId = await createCandidate(
    request,
    name,
    "Operations",
    `e2e-screen-${Date.now()}@example.com`,
  );
  await moveCandidateStatus(request, candidateId, "QUALIFIED_PRESCREEN");

  await page.goto("/screening");

  await page.getByLabel("Search candidates to screen").fill(name);
  await expect(page.getByRole("button", { name: new RegExp(name) })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(name) }).click();

  await page.getByLabel("Years of experience").fill("5");
  await page.getByLabel("Candidate's availability").selectOption("Flexible / Open to Anything");
  await page.getByLabel("Screening Notes").fill(`E2E screening note ${Date.now()}`);

  await page.getByRole("button", { name: "Save Scorecard" }).click();
  await expect(page.getByText("Scorecard saved")).toBeVisible();

  // Saving (not advancing) doesn't move the candidate — it's still in the eligible-stage picker.
  await expect(page.getByRole("button", { name: new RegExp(name) })).toBeVisible();
});
