import { test, expect } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";
import { createCandidate, moveCandidateStatus } from "./fixtures/api";

const SCREENING_API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3004";

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

  await gotoReady(page, "/screening");

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

test("refuses a screening for a candidate that does not exist", async ({ request }) => {
  const response = await request.post(`${SCREENING_API_BASE}/screening/does-not-exist`, {
    data: {},
  });

  expect([404, 422]).toContain(response.status());
});

test("refuses a screening with an out-of-range salary", async ({ request }) => {
  const id = await createCandidate(request, `E2E Salary ${Date.now()}`, "Operations");

  const response = await request.post(`${SCREENING_API_BASE}/screening/${id}`, {
    data: { salaryAsk: 9999999 },
  });

  expect(response.status()).toBe(422);
});

test("refuses a screening action that is not a known action", async ({ request }) => {
  const id = await createCandidate(request, `E2E Action ${Date.now()}`, "Operations");

  const response = await request.post(`${SCREENING_API_BASE}/screening/${id}`, {
    data: { action: "teleport" },
  });

  expect(response.status()).toBe(422);
});
