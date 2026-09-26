import { test, expect } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";
import { createLead } from "./fixtures/api";

const OUTREACH_API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3004";

/**
 * Source lead outreach: add a lead, log an outreach attempt, mark it responded Hot
 * (`apps/web/src/app/(app)/sourcing/add-lead-modal.tsx`, `lead-row.tsx`). A fresh lead
 * (`Sourced`) allows both — `canLogOutreach`/`canRespond` in
 * `packages/domain/src/rules/lead-lifecycle.ts` only block a `Promoted` lead.
 */
test("adds a lead, logs outreach, and marks it responded hot", async ({ page }) => {
  const name = `E2E Outreach Lead ${Date.now()}`;

  await gotoReady(page, "/sourcing");
  await page.getByRole("button", { name: "+ Add lead" }).click();
  await page.getByLabel(/^Name\*?$/).fill(name);
  await page.getByRole("button", { name: "Add Lead", exact: true }).click();

  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: "Log" }).click();
  await page.getByRole("button", { name: "Log outreach", exact: true }).click();
  await expect(row.getByText("Outreach 1")).toBeVisible();

  // The row itself toggles the expanded detail panel; click the name cell, not an action button
  // (those stop propagation — `lead-row.tsx`'s `stop` handler on the actions `<Td>`).
  await row.getByText(name).click();
  // The expanded detail renders as its OWN <tr>, so it is a sibling of the row rather than inside
  // it; `?search=` narrows the page to this lead, which keeps the page-scoped locator unambiguous.
  await page.getByRole("button", { name: "Hot" }).click();
  await expect(page.getByText("Responded — Hot").first()).toBeVisible();
});

test("refuses a response kind that is not hot or cold", async ({ request }) => {
  const leadId = await createLead(request, `E2E Kind ${Date.now()}`);

  const response = await request.post(`${OUTREACH_API_BASE}/leads/${leadId}/respond`, {
    data: { kind: "lukewarm" },
  });

  expect(response.status()).toBe(422);
});

test("refuses a response on a lead that does not exist", async ({ request }) => {
  const response = await request.post(`${OUTREACH_API_BASE}/leads/does-not-exist/respond`, {
    data: { kind: "hot" },
  });

  expect([404, 422]).toContain(response.status());
});

test("refuses logging outreach against an already promoted lead", async ({ request }) => {
  const leadId = await createLead(request, `E2E Promoted ${Date.now()}`);
  const promoted = await request.post(`${OUTREACH_API_BASE}/leads/${leadId}/promote`, { data: {} });
  expect(promoted.ok()).toBeTruthy();

  const response = await request.post(`${OUTREACH_API_BASE}/leads/${leadId}/outreach`, {
    data: { channel: "email" },
  });

  expect(response.status()).toBe(409);
});

test("refuses a snooze date that is not a date", async ({ request }) => {
  const leadId = await createLead(request, `E2E Snooze ${Date.now()}`);

  const response = await request.post(`${OUTREACH_API_BASE}/leads/${leadId}/snooze`, {
    data: { until: "not-a-date" },
  });

  expect(response.status()).toBe(422);
});

async function leadDetail(
  request: import("@playwright/test").APIRequestContext,
  leadId: string,
): Promise<{ lead: { status: string; attempts: { id: string; note: string | null }[] } }> {
  const response = await request.get(`${OUTREACH_API_BASE}/leads/${leadId}`);
  expect(response.ok(), `GET /leads/${leadId}`).toBeTruthy();
  return await response.json();
}

test("edits and then deletes a logged outreach attempt", async ({ request }) => {
  const leadId = await createLead(request, `E2E Attempt Edit ${Date.now()}`);
  const logged = await request.post(`${OUTREACH_API_BASE}/leads/${leadId}/outreach`, {
    data: { channel: "email", note: "E2E original note" },
  });
  expect(logged.ok()).toBeTruthy();

  const attempt = (await leadDetail(request, leadId)).lead.attempts[0];
  expect(attempt, "the logged attempt is readable back").toBeDefined();

  const edited = await request.patch(
    `${OUTREACH_API_BASE}/leads/${leadId}/outreach/${attempt!.id}`,
    { data: { note: "E2E corrected note" } },
  );
  expect(edited.ok()).toBeTruthy();
  expect((await leadDetail(request, leadId)).lead.attempts[0]?.note).toBe("E2E corrected note");

  const deleted = await request.delete(
    `${OUTREACH_API_BASE}/leads/${leadId}/outreach/${attempt!.id}`,
  );
  expect(deleted.ok()).toBeTruthy();
  expect((await leadDetail(request, leadId)).lead.attempts.map((a) => a.id)).not.toContain(
    attempt!.id,
  );
});

test("deletes a lead and restores it from the trash", async ({ request }) => {
  const leadId = await createLead(request, `E2E Lead Delete ${Date.now()}`);

  const deleted = await request.delete(`${OUTREACH_API_BASE}/leads/${leadId}`);
  expect(deleted.ok()).toBeTruthy();

  const restored = await request.post(`${OUTREACH_API_BASE}/leads/${leadId}/restore`);
  expect(restored.ok()).toBeTruthy();

  expect((await leadDetail(request, leadId)).lead.status).not.toBe("deleted");
});

test("refuses restoring a lead that was never deleted", async ({ request }) => {
  const leadId = await createLead(request, `E2E Lead Live ${Date.now()}`);

  const response = await request.post(`${OUTREACH_API_BASE}/leads/${leadId}/restore`);

  expect(response.ok()).toBeFalsy();
});

test("refuses editing an outreach attempt that does not exist", async ({ request }) => {
  const leadId = await createLead(request, `E2E Attempt Missing ${Date.now()}`);

  const response = await request.patch(
    `${OUTREACH_API_BASE}/leads/${leadId}/outreach/does-not-exist`,
    { data: { note: "E2E note" } },
  );

  expect(response.status()).toBe(404);
});
