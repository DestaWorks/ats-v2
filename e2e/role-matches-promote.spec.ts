import { test, expect } from "@playwright/test";
import { createClient, createLead, createRole } from "./fixtures/api";

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

  await page.goto(`/roles/${roleId}`);
  await expect(page.getByRole("heading", { name: roleTitle, level: 1 })).toBeVisible();

  const matchesTab = page.getByRole("tab", { name: /^Matches/ });
  await expect(matchesTab).toBeVisible();
  await matchesTab.click();

  const row = page.getByRole("row").filter({ hasText: leadName });
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: "Fill role" }).click();

  await expect(page.getByText("Promoted into the pipeline")).toBeVisible();
});
