import { test, expect } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";
import { createClient, createLead, createRole } from "./fixtures/api";

const MATCH_API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3004";

/**
 * Role detail's Matches tab — `lead-promotion.spec.ts` (Tier 1) covers promoting a lead from
 * `/sourcing`; this covers the OTHER promote entry point, `role-detail.tsx`'s `MatchesPanel`
 * ("Fill role"), where the lead is discovered as a scored MATCH for a specific role rather than
 * picked by name. A lead whose `clientId` equals the role's client scores `weightSameClient` (30,
 * default weights — `role-matching.ts`), comfortably over the default `minScore` (25), so it's
 * enough to make the lead surface in the Matches table without needing outreach/response steps.
 */
test("shows a matched lead on the role detail page and promotes it via Fill role", async ({
  page,
  request,
}) => {
  const clientName = `E2E Match Client ${Date.now()}`;
  const clientId = await createClient(request, clientName);
  const roleTitle = `E2E Match Role ${Date.now()}`;
  const roleId = await createRole(request, clientId, roleTitle);
  const leadName = `E2E Match Lead ${Date.now()}`;
  await createLead(request, leadName, clientId);

  await gotoReady(page, `/roles/${roleId}`);
  await expect(page.getByRole("heading", { name: roleTitle, level: 1 })).toBeVisible();

  const matchesTab = page.getByRole("tab", { name: /^Matches/ });
  await expect(matchesTab).toBeVisible();
  await matchesTab.click();

  const row = page.getByRole("row").filter({ hasText: leadName });
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: "Fill role" }).click();

  await expect(page.getByText("Promoted into the pipeline")).toBeVisible();
});

test("refuses promoting with no lead id", async ({ request }) => {
  const clientId = await createClient(request, `E2E Promote Client ${Date.now()}`);
  const created = await request.post(`${MATCH_API_BASE}/roles`, {
    data: { clientId, title: `E2E Promote Role ${Date.now()}` },
  });
  expect(created.ok()).toBeTruthy();
  const roleId = (await created.json()).role.id;

  const response = await request.post(`${MATCH_API_BASE}/roles/${roleId}/promote`, { data: {} });

  expect(response.status()).toBe(422);
});

test("refuses promoting a lead that does not exist", async ({ request }) => {
  const clientId = await createClient(request, `E2E Ghost Client ${Date.now()}`);
  const created = await request.post(`${MATCH_API_BASE}/roles`, {
    data: { clientId, title: `E2E Ghost Promote ${Date.now()}` },
  });
  const roleId = (await created.json()).role.id;

  const response = await request.post(`${MATCH_API_BASE}/roles/${roleId}/promote`, {
    data: { leadId: "does-not-exist" },
  });

  expect([404, 422]).toContain(response.status());
});

test("answers 404 for matches on a role that does not exist", async ({ request }) => {
  const response = await request.get(`${MATCH_API_BASE}/roles/does-not-exist/matches`);

  expect(response.status()).toBe(404);
});
