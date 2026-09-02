import { test, expect, type Route } from "@playwright/test";
import type { ParsedJdDTO } from "@destaworks/contracts/validation/open-role";
import { createClient } from "./fixtures/api";

const WEB_ORIGIN = "http://localhost:3007";

/**
 * "Autofill from JD" (`add-role-modal.tsx`) — AI-backed `POST /roles/parse-jd`, mocked here the
 * same way `resume-parse.spec.ts` mocks resume extraction: no AI provider key/cost/flakiness in
 * CI, and this asserts our own wiring (paste → call → populate form fields), not model output
 * quality. Covers the one part of the role-create flow `roles.spec.ts` (Tier 1) doesn't: JD
 * autofill only writes a field when the parsed value is present AND passes the enum-membership
 * check (`handleAutofill` in `add-role-modal.tsx`), so this also proves an out-of-enum value is
 * silently skipped rather than crashing the form.
 */
function mockCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": WEB_ORIGIN,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

const MOCK_PARSED_JD: ParsedJdDTO = {
  title: "Remote PMHNP",
  credential: "PMHNP",
  state: "Ohio",
  city: "Columbus",
  setting: "Telehealth",
  population: "Adult",
  rate: "$110-130/hr",
  priority: "P1",
  description: "Fully remote PMHNP covering adult telehealth intakes and med management.",
};

const SAMPLE_JD_TEXT = `We're hiring a remote PMHNP for adult telehealth intakes and medication
management in Ohio. Rate: $110-130/hr. This is a P1 priority fill.`;

test("autofills the add-role form from a pasted job description", async ({ page, request }) => {
  const clientName = `E2E JD Client ${Date.now()}`;
  await createClient(request, clientName);

  await page.route("**/roles/parse-jd", async (route: Route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: mockCorsHeaders() });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: mockCorsHeaders(),
      body: JSON.stringify(MOCK_PARSED_JD),
    });
  });

  await page.goto("/roles");
  await page.getByRole("button", { name: "+ Add role" }).click();
  await page.getByLabel("Paste a job description (optional)").fill(SAMPLE_JD_TEXT);
  await page.getByRole("button", { name: "✨ Autofill from JD" }).click();

  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(MOCK_PARSED_JD.title ?? "");
  await expect(page.getByLabel("Credential")).toHaveValue("PMHNP");
  await expect(page.getByLabel("City")).toHaveValue("Columbus");
  await expect(page.getByLabel("Rate")).toHaveValue("$110-130/hr");
  await expect(page.getByLabel("Priority")).toHaveValue("P1");
  await expect(page.getByLabel("Description")).toHaveValue(MOCK_PARSED_JD.description ?? "");

  // "Ohio" isn't a member of `US_STATES` (which holds two-letter codes) — `handleAutofill`'s
  // membership check must skip it rather than crash the Select on an unmatched value.
  await expect(page.getByLabel("State")).toHaveValue("");
});
