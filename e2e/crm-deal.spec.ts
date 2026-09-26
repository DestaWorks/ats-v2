import { test, expect } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";
import { createClient } from "./fixtures/api";

const DEAL_API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3004";

/**
 * CRM deal lifecycle: create → move through an open stage → close won
 * (`apps/web/src/app/(app)/crm/[id]/deals-tab.tsx`, `deal-detail-modal.tsx`). The stage
 * `<select>` has no accessible label (a real gap — `deal-detail-modal.tsx:199-200` — flagged, not
 * fixed here), so it's targeted by scoping to the deal modal (a native `<dialog>`, implicit
 * `role="dialog"`) rather than by label.
 */
test("creates a deal, moves its stage, and closes it won", async ({ page, request }) => {
  const clientId = await createClient(request, `E2E Deal Client ${Date.now()}`);
  const dealName = `E2E Deal ${Date.now()}`;

  await gotoReady(page, `/crm/${clientId}`);
  await page.getByRole("tab", { name: "Deals" }).click();
  await page.getByRole("button", { name: "+ Add Deal" }).click();
  await page.getByLabel(/^Name\*?$/).fill(dealName);
  await page.getByRole("button", { name: "Add Deal", exact: true }).click();

  await page.getByRole("button", { name: new RegExp(dealName) }).click();
  const dialog = page.getByRole("dialog");
  const stageSelect = dialog.locator("select");

  // Moving to an open stage PATCHes immediately.
  await stageSelect.selectOption("Contacted");
  await expect(stageSelect).toHaveValue("Contacted");

  // Selecting a closed stage opens the close panel instead of PATCHing directly
  // (`moveStage` in deal-detail-modal.tsx).
  await stageSelect.selectOption("Signed");
  await dialog.getByLabel("Reason").fill("Signed after a strong final call");
  await dialog.getByRole("button", { name: "Mark Won" }).click();

  await dialog.getByRole("button", { name: "Close" }).first().click();
  await expect(page.getByText("Closed Deals")).toBeVisible();
  await expect(page.getByText(dealName).first()).toBeVisible();
  await expect(page.getByText("Won").first()).toBeVisible();
});

test("refuses a deal with no name", async ({ request }) => {
  const clientId = await createClient(request, `E2E Deal Client ${Date.now()}`);

  const response = await request.post(`${DEAL_API_BASE}/crm/clients/${clientId}/deals`, {
    data: { name: "  " },
  });

  expect(response.status()).toBe(422);
});

test("refuses a deal with a probability outside nought to a hundred", async ({ request }) => {
  const clientId = await createClient(request, `E2E Prob Client ${Date.now()}`);

  const response = await request.post(`${DEAL_API_BASE}/crm/clients/${clientId}/deals`, {
    data: { name: `E2E Prob ${Date.now()}`, probabilityOverride: 150 },
  });

  expect(response.status()).toBe(422);
});

test("refuses a deal on a client that does not exist", async ({ request }) => {
  const response = await request.post(`${DEAL_API_BASE}/crm/clients/does-not-exist/deals`, {
    data: { name: `E2E Ghost Deal ${Date.now()}` },
  });

  expect([404, 422]).toContain(response.status());
});

async function dealsFor(
  request: import("@playwright/test").APIRequestContext,
  clientId: string,
): Promise<{ id: string; name: string; stage: string }[]> {
  const response = await request.get(`${DEAL_API_BASE}/crm/clients/${clientId}`);
  const { deals } = (await response.json()) as {
    deals: { id: string; name: string; stage: string }[];
  };
  return deals;
}

async function seedDeal(
  request: import("@playwright/test").APIRequestContext,
  label: string,
): Promise<{ clientId: string; dealId: string }> {
  const clientId = await createClient(request, `E2E ${label} Client ${Date.now()}`);
  const created = await request.post(`${DEAL_API_BASE}/crm/clients/${clientId}/deals`, {
    data: { name: `E2E ${label} Deal ${Date.now()}` },
  });
  expect(created.ok()).toBeTruthy();
  const { deal } = (await created.json()) as { deal: { id: string } };
  return { clientId, dealId: deal.id };
}

test("edits a deal and keeps the change", async ({ request }) => {
  const { clientId, dealId } = await seedDeal(request, "Deal Edit");
  const renamed = `E2E Renamed Deal ${Date.now()}`;

  const patched = await request.patch(`${DEAL_API_BASE}/crm/clients/${clientId}/deals/${dealId}`, {
    data: { name: renamed, stage: "Negotiation", estValue: 42_000 },
  });
  expect(patched.ok()).toBeTruthy();

  const deal = (await dealsFor(request, clientId)).find((d) => d.id === dealId);
  expect(deal?.name).toBe(renamed);
  expect(deal?.stage).toBe("Negotiation");
});

test("refuses a deal edit that changes nothing", async ({ request }) => {
  const { clientId, dealId } = await seedDeal(request, "Deal No-op");

  const response = await request.patch(`${DEAL_API_BASE}/crm/clients/${clientId}/deals/${dealId}`, {
    data: {},
  });

  expect(response.status()).toBe(422);
});

test("deletes a deal and it stops coming back", async ({ request }) => {
  const { clientId, dealId } = await seedDeal(request, "Deal Delete");

  const deleted = await request.delete(`${DEAL_API_BASE}/crm/clients/${clientId}/deals/${dealId}`);
  expect(deleted.ok()).toBeTruthy();

  expect((await dealsFor(request, clientId)).map((d) => d.id)).not.toContain(dealId);
});

test("adds, resolves and deletes a deal blocker", async ({ request }) => {
  const { clientId, dealId } = await seedDeal(request, "Blocker");
  const base = `${DEAL_API_BASE}/crm/clients/${clientId}/deals/${dealId}/blockers`;

  const added = await request.post(base, { data: { text: "E2E blocker: awaiting signed MSA" } });
  expect(added.ok()).toBeTruthy();
  const { blocker } = (await added.json()) as { blocker: { id: string } };

  const resolved = await request.patch(`${base}/${blocker.id}`, { data: { resolved: true } });
  expect(resolved.ok()).toBeTruthy();

  const deleted = await request.delete(`${base}/${blocker.id}`);
  expect(deleted.ok()).toBeTruthy();

  const gone = await request.patch(`${base}/${blocker.id}`, { data: { resolved: false } });
  expect(gone.status()).toBe(404);
});

test("refuses a blocker with no text", async ({ request }) => {
  const { clientId, dealId } = await seedDeal(request, "Blocker Empty");

  const response = await request.post(
    `${DEAL_API_BASE}/crm/clients/${clientId}/deals/${dealId}/blockers`,
    { data: { text: "" } },
  );

  expect(response.status()).toBe(422);
});
