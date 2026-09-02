import { test, expect, type Route } from "@playwright/test";
import type { TriageResultDTO } from "@destaworks/contracts/validation/inbound";
import type { LeadEnvelope } from "@destaworks/contracts/validation/lead";

const WEB_ORIGIN = "http://localhost:3007";

/**
 * Inbound Triage (`inbound-triage.tsx`) — AI-backed `POST /inbound/triage`, mocked the same way
 * `resume-parse.spec.ts` mocks resume extraction: no AI cost/flakiness in CI, asserts our own
 * wiring (paste → extract → review → save), not model output quality. Covers the "no existing
 * match" save-as-new-lead path; `resume-dedupe.spec.ts` already covers the analogous
 * confirm-before-attach UX for resumes, and inbound's own "Attach to this lead" banner
 * (`ExistingMatchBanner`) is the same shape, not re-covered here to keep this to one flow.
 */
function mockCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": WEB_ORIGIN,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

const MOCK_TRIAGE_RESULT: TriageResultDTO = {
  extracted: {
    name: "Casey Nguyen",
    email: "casey.nguyen@example.com",
    phone: "555-020-9876",
    linkedinUrl: null,
    credential: "PMHNP",
    licenseState: "OH",
    city: "Columbus",
    state: "OH",
    yearsExp: 4,
    settingPreference: "Telehealth",
    populationPreference: "Adult",
    telehealthPreference: "Yes",
    rateExpectation: "$110/hr",
    availability: "Immediate",
    intent: "open_to_opportunity",
    summary: "PMHNP interested in remote adult telehealth roles, available immediately.",
  },
  clientMatches: [],
  existing: null,
};

const SAMPLE_MESSAGE =
  "Hi, thanks for reaching out! I'm a PMHNP in Ohio, open to remote telehealth roles for adults. " +
  "I'm available immediately and my rate is around $110/hr.";

test("triages a pasted reply with AI and saves it as a new Sourced lead", async ({ page }) => {
  await page.route("**/inbound/triage", async (route: Route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: mockCorsHeaders() });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: mockCorsHeaders(),
      body: JSON.stringify(MOCK_TRIAGE_RESULT),
    });
  });

  await page.route("**/inbound/save", async (route: Route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: mockCorsHeaders() });
      return;
    }
    const ack: LeadEnvelope = {
      lead: {
        id: "lead_e2e_inbound_0001",
        name: MOCK_TRIAGE_RESULT.extracted.name ?? "",
        email: MOCK_TRIAGE_RESULT.extracted.email,
        phone: MOCK_TRIAGE_RESULT.extracted.phone,
        credential: MOCK_TRIAGE_RESULT.extracted.credential,
        state: MOCK_TRIAGE_RESULT.extracted.state,
        source: "Inbound",
        status: "Responded — Hot",
        outreachCount: 0,
        lastOutreachAt: null,
        lastOutreachChannel: null,
        targetClientName: null,
        ownerName: null,
        promotedCandidateId: null,
        createdAt: new Date(0).toISOString(),
        deletedAt: null,
        linkedinUrl: MOCK_TRIAGE_RESULT.extracted.linkedinUrl,
        tags: [],
        notes: null,
        respondedAt: new Date(0).toISOString(),
        targetClientId: null,
        attempts: [],
      },
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: mockCorsHeaders(),
      body: JSON.stringify(ack),
    });
  });

  await page.goto("/sourcing/inbound");
  await page.getByLabel("Pasted message").fill(SAMPLE_MESSAGE);
  await page.getByRole("button", { name: "✨ Triage with AI" }).click();

  await expect(page.getByRole("heading", { name: "Extracted details" })).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveValue("Casey Nguyen");
  await expect(page.getByLabel("Credential")).toHaveValue("PMHNP");

  await page.getByRole("button", { name: "Save as Sourced Lead (Responded — Hot)" }).click();

  await expect(page.getByText("Saved — Casey Nguyen is now Responded — Hot.")).toBeVisible();
});
