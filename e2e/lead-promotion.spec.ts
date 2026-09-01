import { test, expect } from "@playwright/test";
import { createLead } from "./fixtures/api";

/**
 * Promote lead — one of the four critical flows (docs/CONVENTIONS.md §10). The lead fixture is
 * created directly via the API (`createLead`) so this test exercises only the promote
 * interaction: "Promote" → confirm modal → "Promote to candidate"
 * (`apps/web/src/app/(app)/sourcing/lead-row.tsx`).
 */
test("promotes a lead into the candidate pipeline", async ({ page, request }) => {
  const name = `E2E Lead ${Date.now()}`;
  await createLead(request, name);

  await page.goto(`/sourcing?search=${encodeURIComponent(name)}`);
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: "Promote" }).click();
  await page.getByRole("button", { name: "Promote to candidate" }).click();

  // Promoted rows swap the button for a "→ C…" link into the new candidate.
  await expect(row.getByRole("link", { name: /^→ C/ })).toBeVisible();
});
