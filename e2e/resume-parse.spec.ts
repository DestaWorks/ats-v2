import { test, expect, type Route } from "@playwright/test";
import type { ExtractResumeResponse } from "@destaworks/contracts/validation/resume";

const WEB_ORIGIN = "http://localhost:3007";

/**
 * `POST /resume/extract` is AI-backed (`apps/api/src/modules/resume/resume.controller.ts`) and
 * called cross-origin, credentialed, from the browser (`apps/web/src/lib/api/client.ts`). Mocking
 * it here means no `ANTHROPIC_API_KEY` secret, no LLM cost/flakiness in CI, and the test asserts
 * our own wiring (upload → call → render → save), not model output quality — see the plan's
 * "Resume-parse mocking" note. Non-`*` CORS headers are required because the real request carries
 * `credentials: "include"`, which the fetch spec forbids combining with a wildcard origin; the
 * preflight `OPTIONS` the browser sends for this non-simple (JSON, credentialed) request is
 * handled by the same route.
 */
function mockCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": WEB_ORIGIN,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

const MOCK_EXTRACTION: ExtractResumeResponse = {
  variant: "operations",
  data: {
    name: "Jordan Rivera",
    headerRole: "Patient Intake Coordinator",
    email: "jordan.rivera@example.com",
    phone: "555-010-1234",
    homeBase: { city: "Columbus", stateOrCountry: "OH", timezone: "America/New_York" },
    workMode: "Remote",
    targetStart: "Immediate",
    snapshot: "Operations coordinator with 5 years of behavioral-health intake experience.",
    verificationLine: "",
    experience: [],
    education: [],
    coverageHours: "Mon-Fri 9am-5pm ET",
    englishLevel: "Fluent",
    referencesStatus: "Available on request",
    systemsTools: ["Epic", "Salesforce"],
    skills: { functional: ["Intake", "Scheduling", "Insurance verification"] },
  },
  match: { status: "none", score: 0 },
};

const SAMPLE_RESUME_TEXT = `Jordan Rivera
Patient Intake Coordinator
jordan.rivera@example.com | 555-010-1234

Summary
Operations coordinator with 5 years of behavioral-health intake experience, fluent in
scheduling, insurance verification, and EHR systems (Epic, Salesforce).

Availability: Monday-Friday, 9am-5pm ET. References available on request.`;

test("parses a resume and saves it as a new candidate", async ({ page }) => {
  // /resume pulls in pdf.js — the heaviest first-compile of the four flows under `next dev`.
  test.setTimeout(180_000);

  await page.route("**/resume/extract", async (route: Route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: mockCorsHeaders() });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: mockCorsHeaders(),
      body: JSON.stringify(MOCK_EXTRACTION),
    });
  });

  await page.goto("/resume");
  await page.getByRole("radio", { name: "Operations" }).click();
  await page.getByLabel("Or paste resume text").fill(SAMPLE_RESUME_TEXT);
  await page.getByRole("button", { name: "Extract & Convert" }).click();

  await expect(
    page.getByText("Extracted by AI — review and fact-check before saving."),
  ).toBeVisible();
  await expect(
    page.getByText("No existing candidate matched — a new candidate will be created."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Save as New Candidate" }).click();

  await expect(page.getByText(`✓ ${MOCK_EXTRACTION.data.name} saved`)).toBeVisible();
});
