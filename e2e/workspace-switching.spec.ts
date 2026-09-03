import { test, expect, type Browser, type Page } from "@playwright/test";
import { createUser } from "./fixtures/api";

/**
 * The multi-tenant lifecycle `workspace-members.spec.ts` couldn't reach with only one tenant:
 * inviting an account that's active in a DIFFERENT workspace, accepting via the header's
 * `WorkspaceSwitcher` (`apps/web/src/app/(app)/workspace-switcher.tsx`), and the `/choose-workspace`
 * gate (`apps/web/src/app/(gate)/choose-workspace`) a fresh, no-cookie session hits once someone
 * is active in more than one.
 *
 * Needs a second tenant to exist, which `scripts/seed-second-tenant.ts` provides in CI/dev
 * alongside the default one `db:seed` creates — see that script and `SEED_TENANT_B_*` in
 * `.github/workflows/ci.yml`'s `e2e` job.
 */

const TENANT_B_OWNER_EMAIL = process.env["SEED_TENANT_B_OWNER_EMAIL"] ?? "owner-b@e2e.local";
const TENANT_B_OWNER_PASSWORD = process.env["SEED_TENANT_B_OWNER_PASSWORD"] ?? "E2eOwnerBPass123!";
const TENANT_B_NAME = process.env["SEED_TENANT_B_NAME"] ?? "E2E Second Workspace";

/** Signs in as `email` in a brand-new context — the shared `chromium` project's `storageState` is
 *  the default tenant's seeded Owner, so this can't ride `page`/`request` without clobbering that
 *  session. Does not assert a destination: where sign-in lands depends on how many active
 *  memberships `email` has, which is exactly what each call site below is testing. */
async function signInFresh(
  browser: Browser,
  email: string,
  password: string,
): Promise<{ context: Awaited<ReturnType<Browser["newContext"]>>; page: Page }> {
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  return { context, page };
}

test("invites across tenants, accepts via the header switcher, and resolves the picker on a fresh session", async ({
  browser,
  request,
}) => {
  // Active in the default (Tenant A) workspace only, to start.
  const inviteeEmail = `e2e-cross-tenant-${Date.now()}@example.com`;
  const inviteePassword = "E2eCrossTenant123!";
  await createUser(
    request,
    `E2E Cross Tenant ${Date.now()}`,
    inviteeEmail,
    "Associate",
    inviteePassword,
  );

  // Tenant B's Owner invites that account into Tenant B.
  const ownerB = await signInFresh(browser, TENANT_B_OWNER_EMAIL, TENANT_B_OWNER_PASSWORD);
  await expect(ownerB.page).toHaveURL(/\/dashboard/);
  await ownerB.page.goto("/workspace");
  await ownerB.page.getByLabel("Email").fill(inviteeEmail);
  await ownerB.page.getByRole("button", { name: "Invite", exact: true }).click();
  await expect(ownerB.page.getByText(`Invited ${inviteeEmail}`)).toBeVisible();
  await ownerB.context.close();

  // The invitee is still resolved into Tenant A (their only ACTIVE membership so far) and sees
  // the pending invitation as a badge on the header switcher, not as a workspace pick.
  const invitee = await signInFresh(browser, inviteeEmail, inviteePassword);
  await expect(invitee.page).toHaveURL(/\/dashboard/);
  const switcherButton = invitee.page.locator('button[aria-haspopup="menu"]');
  await expect(switcherButton).toContainText("1"); // one pending invitation
  await switcherButton.click();
  await invitee.page.getByRole("menuitem", { name: new RegExp(TENANT_B_NAME) }).click();
  await expect(invitee.page.getByText(`Now working in ${TENANT_B_NAME}`)).toBeVisible();

  // Accepting made a SECOND active membership real with no tenant claim in this session (accept
  // sets no cookie — only `/tenants/switch` does), so `router.refresh()` re-renders the (app)
  // layout's guard straight into AMBIGUOUS: it redirects to the picker in this same session,
  // without a fresh sign-in.
  await expect(invitee.page).toHaveURL(/\/choose-workspace/);
  await invitee.page.getByRole("button", { name: new RegExp(TENANT_B_NAME) }).click();
  await expect(invitee.page).toHaveURL(/\/dashboard/);
  await invitee.context.close();
});
