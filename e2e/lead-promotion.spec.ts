import { test, expect } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";
import { createLead } from "./fixtures/api";

const LEADS_API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3004";

/**
 * Promote lead — one of the four critical flows (docs/CONVENTIONS.md §10). The lead fixture is
 * created directly via the API (`createLead`) so this test exercises only the promote
 * interaction: "Promote" → confirm modal → "Promote to candidate"
 * (`apps/web/src/app/(app)/sourcing/lead-row.tsx`).
 */
test("promotes a lead into the candidate pipeline", async ({ page, request }) => {
  const name = `E2E Lead ${Date.now()}`;
  await createLead(request, name);

  await gotoReady(page, `/sourcing?search=${encodeURIComponent(name)}`);
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: "Promote" }).click();
  await page.getByRole("button", { name: "Promote to candidate" }).click();

  // Promoted rows swap the button for a "→ C…" link into the new candidate.
  await expect(row.getByRole("link", { name: /^→ C/ })).toBeVisible();
});

test("refuses a second promotion of the same lead", async ({ request }) => {
  const leadId = await createLead(request, `E2E Twice ${Date.now()}`);

  const first = await request.post(`${LEADS_API_BASE}/leads/${leadId}/promote`, { data: {} });
  expect(first.ok()).toBeTruthy();

  const second = await request.post(`${LEADS_API_BASE}/leads/${leadId}/promote`, { data: {} });
  expect(second.status()).toBe(409);
});

test("refuses a lead with no name", async ({ request }) => {
  const response = await request.post(`${LEADS_API_BASE}/leads`, { data: { name: "  " } });

  expect(response.status()).toBe(422);
});

test("refuses outreach logged against a lead that does not exist", async ({ request }) => {
  const response = await request.post(`${LEADS_API_BASE}/leads/does-not-exist/outreach`, {
    data: { channel: "email" },
  });

  expect([404, 422]).toContain(response.status());
});

test("refuses outreach on an unknown channel", async ({ request }) => {
  const leadId = await createLead(request, `E2E Channel ${Date.now()}`);

  const response = await request.post(`${LEADS_API_BASE}/leads/${leadId}/outreach`, {
    data: { channel: "carrier-pigeon" },
  });

  expect(response.status()).toBe(422);
});
