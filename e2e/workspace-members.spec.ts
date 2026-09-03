import { test, expect } from "@playwright/test";
import { createUser } from "./fixtures/api";

/**
 * Workspace members (`apps/web/src/app/(app)/workspace/members-view.tsx`, Phase 6.5) — no prior
 * E2E coverage exists for this page or for `membershipService` at all.
 *
 * Scoped to what a SINGLE seeded tenant can exercise: there is currently no fixture path (API or
 * seed script) that produces a second tenant, and `membershipService.invite` only attaches a
 * membership to an account that already exists elsewhere — it cannot create one. A true
 * invited → accepted lifecycle needs a second tenant to invite an outside account FROM, which
 * isn't reachable yet (see the follow-up note left for the team on this branch). What IS fully
 * reachable with one tenant: the roster itself, both of `invite`'s failure branches
 * (`NOT_FOUND` for an email with no account anywhere, `CONFLICT` for one already active in this
 * workspace), and removing an existing member.
 */
test("shows the acting Owner in the roster with no self-remove option", async ({ page }) => {
  const ownerEmail = process.env["SEED_OWNER_EMAIL"] ?? "owner@desta.local";

  await page.goto("/workspace");
  const row = page.getByRole("row").filter({ hasText: ownerEmail });

  await expect(row.getByText("you", { exact: true })).toBeVisible();
  await expect(row.getByText("active", { exact: true })).toBeVisible();
  await expect(row.getByRole("button", { name: "Remove", exact: true })).toHaveCount(0);
});

test("surfaces the two invite failure branches", async ({ page, request }) => {
  await page.goto("/workspace");

  // No account anywhere on the installation with this email.
  // NOTE: `messageForFailure` (`apps/web/src/lib/api/client.ts`) hardcodes its `NOT_FOUND` branch
  // to a candidate-specific string ("This candidate no longer exists.") regardless of which
  // domain raised it — a pre-existing bug surfaced by writing this test, not something this test
  // should paper over. Asserting the (misleading) text the user actually sees today, not the
  // server's real "No account with that email address" message, so this test starts failing the
  // moment someone fixes `messageForFailure` and needs updating alongside that fix.
  const nonexistentEmail = `e2e-no-such-account-${Date.now()}@example.com`;
  await page.getByLabel("Email").fill(nonexistentEmail);
  await page.getByRole("button", { name: "Invite", exact: true }).click();
  await expect(page.getByText("This candidate no longer exists.")).toBeVisible();

  // An email that already has an active membership in this workspace (any fixture user does,
  // since `POST /admin/users` creates the account and an active membership in one act).
  const memberEmail = `e2e-existing-member-${Date.now()}@example.com`;
  await createUser(
    request,
    `E2E Existing Member ${Date.now()}`,
    memberEmail,
    "Associate",
    "E2eExisting123!",
  );
  await page.getByLabel("Email").fill(memberEmail);
  await page.getByRole("button", { name: "Invite", exact: true }).click();
  await expect(page.getByText("That account is already a member of this workspace")).toBeVisible();
});

test("removes a member from the workspace", async ({ page, request }) => {
  const email = `e2e-remove-member-${Date.now()}@example.com`;
  await createUser(request, `E2E Remove Member ${Date.now()}`, email, "Associate", "E2eRemove123!");

  // The roster is fetched server-side at page load, so the fixture user created above needs a
  // fresh navigation to appear — reloading after `createUser` resolves isn't enough on its own if
  // this ever runs `page.goto` before the POST settles, which is why `createUser` is awaited first.
  await page.goto("/workspace");
  const row = page.getByRole("row").filter({ hasText: email });
  await expect(row).toBeVisible();
  await expect(row.getByText("active", { exact: true })).toBeVisible();

  await row.getByRole("button", { name: "Remove", exact: true }).click();

  await expect(page.getByText(`Removed E2E Remove Member`)).toBeVisible();
  await expect(row.getByText("removed", { exact: true })).toBeVisible();
  await expect(row.getByRole("button", { name: "Remove", exact: true })).toHaveCount(0);
});
