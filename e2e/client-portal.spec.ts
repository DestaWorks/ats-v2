import { test, expect } from "@playwright/test";
import { createClient, createClientContact, generatePortalLink } from "./fixtures/api";

/**
 * Client Portal — the one flow in the app NOT gated by a Better Auth session at all
 * (`resolvePortalContact()` reads an HttpOnly `PORTAL_TOKEN_COOKIE` instead, set by the one-time
 * link exchange at `/portal/access?token=...` — `apps/web/src/app/portal/access/route.ts`). Sets
 * up a client + contact + generated link as the signed-in Owner (staff-side CRM action), then
 * exchanges that link in a FRESH context — `browser.newContext({ storageState: undefined })`, the
 * same pattern `admin-access-blocked.spec.ts` uses — since a real client never has staff's Owner
 * session. Covers: the link exchange lands on `/portal` with the right client/contact identity,
 * and the "Post a role" flow, the one client-facing WRITE this page exposes.
 */
test("exchanges a portal link and posts a role as the client contact", async ({
  request,
  browser,
}) => {
  const clientName = `E2E Portal Client ${Date.now()}`;
  const contactName = `E2E Portal Contact ${Date.now()}`;
  const clientId = await createClient(request, clientName);
  const contactId = await createClientContact(request, clientId, contactName);
  const token = await generatePortalLink(request, clientId, contactId);

  const context = await browser.newContext({ storageState: undefined });
  // `readTenantClaim` (`packages/auth/src/tenant-claim.ts`) resolves the tenant from a path
  // segment, a subdomain, or the `dw_tenant` cookie, in that order — a bare `localhost` host has
  // no subdomain claim (`fromHost` requires a real parent domain), so local dev relies on the
  // cookie. Real deployments carry this via the tenant's subdomain instead; the seeded local
  // tenant's slug is `destaworks` (`scripts/seed-owner.ts`).
  await context.addCookies([
    { name: "dw_tenant", value: "destaworks", url: "http://localhost:3007" },
  ]);
  const page = await context.newPage();

  await page.goto(`/portal/access?token=${encodeURIComponent(token)}`);
  await expect(page).toHaveURL(/\/portal$/);
  await expect(page.getByRole("heading", { name: clientName, level: 1 })).toBeVisible();
  await expect(page.getByText(`Welcome, ${contactName}.`)).toBeVisible();

  await page.getByRole("tab", { name: /^Open Roles/ }).click();
  await page.getByRole("button", { name: "+ Post a role" }).click();

  const roleTitle = `E2E Portal Role ${Date.now()}`;
  await page.getByLabel("Title", { exact: true }).fill(roleTitle);
  await page.getByRole("button", { name: "Post Role" }).click();

  await expect(page.getByText(roleTitle)).toBeVisible();
  await expect(page.getByRole("tab", { name: "Open Roles (1)" })).toBeVisible();

  await context.close();
});
