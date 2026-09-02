import { test, expect, type Route } from "@playwright/test";
import type { ExtractResumeResponse } from "@destaworks/contracts/validation/resume";
import type { ResumeSaveAckEnvelope } from "@destaworks/contracts/validation/envelopes";

const WEB_ORIGIN = "http://localhost:3007";

/**
 * Covers the name-fuzzy dedupe path of the resume flow — `resume-parse.spec.ts` (Tier 1) already
 * covers `match.status: "none"` (no candidate on file). This mocks `/resume/extract` returning
 * `status: "confirm"` (`confirm-gate.ts`: name-fuzzy, NOT pre-selected — attaches only if the
 * reviewer explicitly ticks "This is the same person", unlike `auto`/email-exact which is
 * pre-checked and undeclinable). Asserts: the checkbox starts unchecked, the Save button reads
 * "Save as New Candidate" until ticked, then "Attach & Save" once ticked — and that ticking it is
 * what actually puts `confirmedCandidateId` on the save request body, not just the button label.
 */
function mockCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": WEB_ORIGIN,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

const MATCHED_CANDIDATE_ID = "cand_e2e_fuzzy_match_0001";
const MATCHED_CANDIDATE_NAME = "Jordan Rivera";

const MOCK_EXTRACTION: ExtractResumeResponse = {
  variant: "operations",
  data: {
    name: "Jordan Rivera",
    headerRole: "Patient Intake Coordinator",
    email: "jordan.rivera.new@example.com",
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
  match: {
    status: "confirm",
    candidateId: MATCHED_CANDIDATE_ID,
    candidateName: MATCHED_CANDIDATE_NAME,
    score: 82,
    reason: "name-fuzzy",
  },
};

const SAMPLE_RESUME_TEXT = `Jordan Rivera
Patient Intake Coordinator
jordan.rivera.new@example.com | 555-010-1234

Summary
Operations coordinator with 5 years of behavioral-health intake experience, fluent in
scheduling, insurance verification, and EHR systems (Epic, Salesforce).

Availability: Monday-Friday, 9am-5pm ET. References available on request.`;

test("requires an explicit confirm before attaching a name-fuzzy resume match", async ({
  page,
}) => {
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

  let saveRequestBody: Record<string, unknown> | undefined;
  await page.route("**/resume/save", async (route: Route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: mockCorsHeaders() });
      return;
    }
    saveRequestBody = route.request().postDataJSON() as Record<string, unknown>;
    const ack: ResumeSaveAckEnvelope = {
      candidate: { id: MATCHED_CANDIDATE_ID, name: MATCHED_CANDIDATE_NAME },
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: mockCorsHeaders(),
      body: JSON.stringify(ack),
    });
  });

  await page.goto("/resume");
  await page.getByRole("radio", { name: "Operations" }).click();
  await page.getByLabel("Or paste resume text").fill(SAMPLE_RESUME_TEXT);
  await page.getByRole("button", { name: "Extract & Convert" }).click();

  await expect(
    page.getByText(`A possible match: ${MATCHED_CANDIDATE_NAME}`, { exact: false }),
  ).toBeVisible();

  const confirmCheckbox = page.getByRole("checkbox", { name: "This is the same person" });
  await expect(confirmCheckbox).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Save as New Candidate" })).toBeVisible();

  await confirmCheckbox.check();
  await expect(page.getByRole("button", { name: "Attach & Save" })).toBeVisible();

  await page.getByRole("button", { name: "Attach & Save" }).click();

  await expect(page.getByText(`✓ ${MATCHED_CANDIDATE_NAME} saved`)).toBeVisible();
  expect(saveRequestBody?.["confirmedCandidateId"]).toBe(MATCHED_CANDIDATE_ID);
});
