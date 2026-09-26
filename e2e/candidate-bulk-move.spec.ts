import { test, expect } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";
import { createCandidate } from "./fixtures/api";

const BULK_API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3004";

/**
 * Bulk-move candidates from the `/candidates` list
 * (`apps/web/src/app/(app)/candidates/candidates-list.tsx`). Targets `CLIENT_INTERVIEW`, one of
 * the ungated stages (`packages/domain/src/rules/stage-gates.ts`), so the fixture needs no
 * email/phone/credential — keeping this test about the bulk-select-and-move mechanic itself.
 */
test("bulk-moves two candidates to a new stage", async ({ page, request }) => {
  const suffix = Date.now();
  const nameA = `E2E Bulk A ${suffix}`;
  const nameB = `E2E Bulk B ${suffix}`;
  await createCandidate(request, nameA);
  await createCandidate(request, nameB);

  // Both fixture names share this timestamp suffix — searching it alone matches both rows
  // without needing an exact/prefix match on the full "E2E Bulk A/B …" name.
  await gotoReady(page, `/candidates?search=${suffix}`);
  await page.getByLabel(`Select ${nameA}`).check();
  await page.getByLabel(`Select ${nameB}`).check();

  await page.getByLabel("Move selected candidates to stage").selectOption("CLIENT_INTERVIEW");
  await page.getByRole("button", { name: "Move", exact: true }).click();

  await expect(page.getByText(/Moved 2 to/)).toBeVisible();
});

test("refuses a bulk move with an empty id list", async ({ request }) => {
  const response = await request.post(`${BULK_API_BASE}/candidates/bulk-move`, {
    data: { ids: [], toStatus: "QUALIFIED_PRESCREEN" },
  });

  expect(response.status()).toBe(422);
});

test("refuses a bulk move to a status that does not exist", async ({ request }) => {
  const response = await request.post(`${BULK_API_BASE}/candidates/bulk-move`, {
    data: { ids: ["does-not-exist"], toStatus: "NOT_A_STATUS" },
  });

  expect(response.status()).toBe(422);
});

test("reports how many candidates actually moved", async ({ request }) => {
  const stamp = Date.now();
  const a = await createCandidate(
    request,
    `E2E Bulk A ${stamp}`,
    "Operations",
    `a${stamp}@e2e.test`,
  );
  const b = await createCandidate(
    request,
    `E2E Bulk B ${stamp}`,
    "Operations",
    `b${stamp}@e2e.test`,
  );

  const response = await request.post(`${BULK_API_BASE}/candidates/bulk-move`, {
    data: { ids: [a, b], toStatus: "QUALIFIED_PRESCREEN" },
  });

  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.moved).toHaveLength(2);
});

test("names the candidates a gate blocked instead of moving them", async ({ request }) => {
  const clinical = await createCandidate(request, `E2E Bulk Gate ${Date.now()}`, "Clinical");

  const response = await request.post(`${BULK_API_BASE}/candidates/bulk-move`, {
    data: { ids: [clinical], toStatus: "QUALIFIED_PRESCREEN" },
  });

  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.moved).toHaveLength(0);
  expect(body.blocked[0].reason).toContain("Credential required");
});
