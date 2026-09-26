import { test, expect } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";
import { createUser } from "./fixtures/api";

const MEMBERS_API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3004";

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

  await gotoReady(page, "/workspace");
  const row = page.getByRole("row").filter({ hasText: ownerEmail });

  await expect(row.getByText("you", { exact: true })).toBeVisible();
  await expect(row.getByText("active", { exact: true })).toBeVisible();
  await expect(row.getByRole("button", { name: "Remove", exact: true })).toHaveCount(0);
});

test("surfaces the two invite failure branches", async ({ page, request }) => {
  await gotoReady(page, "/workspace");

  // No account anywhere on the installation with this email.
  // NOTE: `messageForFailure` (`apps/web/src/lib/api/client.ts`) hardcodes its `NOT_FOUND` branch
  // to a candidate-specific string ("This candidate no longer exists.") regardless of which
  // domain raised it — a pre-existing bug surfaced by writing this test, not something this test
  // should paper over. Asserting the (misleading) text the user actually sees today, not the
  // server's real "No account with that email address" message, so this test starts failing the
  // moment someone fixes `messageForFailure` and needs updating alongside that fix.
  const nonexistentEmail = `e2e-no-such-account-${Date.now()}@example.com`;
  await page.getByRole("button", { name: "Invite member", exact: true }).click();
  await page.getByLabel("Email").fill(nonexistentEmail);
  await page.getByRole("button", { name: "Send invitation", exact: true }).click();
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
  // The modal stays open on a refusal, so the second branch reuses it rather than reopening.
  await page.getByLabel("Email").fill(memberEmail);
  await page.getByRole("button", { name: "Send invitation", exact: true }).click();
  await expect(page.getByText("That account is already a member of this workspace")).toBeVisible();
});

test("removes a member from the workspace", async ({ page, request }) => {
  const email = `e2e-remove-member-${Date.now()}@example.com`;
  const memberName = `E2E Remove Member ${Date.now()}`;
  await createUser(request, memberName, email, "Associate", "E2eRemove123!");

  // The roster is fetched server-side at page load, so the fixture user created above needs a
  // fresh navigation to appear — reloading after `createUser` resolves isn't enough on its own if
  // this ever runs `page.goto` before the POST settles, which is why `createUser` is awaited first.
  await gotoReady(page, "/workspace");
  const row = page.getByRole("row").filter({ hasText: email });
  await expect(row).toBeVisible();
  await expect(row.getByText("active", { exact: true })).toBeVisible();

  await row.getByRole("button", { name: "Remove", exact: true }).click();

  await expect(page.getByText(`${memberName} removed`)).toBeVisible();
  await expect(row.getByText("removed", { exact: true })).toBeVisible();
  await expect(row.getByRole("button", { name: "Remove", exact: true })).toHaveCount(0);
});

test("refuses an invitation to a malformed email address", async ({ request }) => {
  const response = await request.post(`${MEMBERS_API_BASE}/tenants/members`, {
    data: { email: "not-an-email", role: "Associate" },
  });

  expect(response.status()).toBe(422);
});

test("locks a removed member out of the workspace", async ({ request, browser }) => {
  const stamp = Date.now();
  const email = `e2e-locked-out-${stamp}@example.com`;
  const password = "E2eLockedOut123!";
  await createUser(request, `E2E Locked Out ${stamp}`, email, "Associate", password);

  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const signIn = await context.request.post("http://localhost:3007/api/auth/sign-in/email", {
    data: { email, password },
    headers: { origin: "http://localhost:3007" },
  });
  expect(signIn.ok()).toBeTruthy();
  const entered = await context.request.post(`${MEMBERS_API_BASE}/tenants/switch`, {
    data: { tenant: "destaworks" },
  });
  expect(entered.ok(), "the member reaches the workspace before removal").toBeTruthy();

  const roster = await request.get(`${MEMBERS_API_BASE}/tenants/members`);
  const { members } = (await roster.json()) as {
    members: { membershipId: string; email: string }[];
  };
  const membership = members.find((member) => member.email === email);
  expect(membership, `no membership for ${email}`).toBeDefined();
  const removed = await request.delete(
    `${MEMBERS_API_BASE}/tenants/members/${membership!.membershipId}`,
  );
  expect(removed.ok()).toBeTruthy();

  const afterRemoval = await context.request.post(`${MEMBERS_API_BASE}/tenants/switch`, {
    data: { tenant: "destaworks" },
  });
  expect(afterRemoval.ok(), "a removed member cannot re-enter the workspace").toBeFalsy();

  await context.close();
});
