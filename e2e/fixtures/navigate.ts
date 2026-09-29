import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Navigate, then wait until the page is actually INTERACTIVE rather than merely rendered.
 *
 * Server-rendered markup carries the buttons before React has hydrated, so Playwright finds them
 * present and enabled and clicks them — and the click is dropped, because no handler is attached
 * yet. Nothing about the element says "not ready", so auto-waiting cannot save it; the failure
 * surfaces much later as a modal that never opened.
 *
 * The idle wait is swallowed on purpose: a view that keeps a request in flight would otherwise
 * turn a readiness hint into a timeout, and by then the settle has served its purpose anyway.
 */
export async function gotoReady(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForLoadState("networkidle").catch(() => {});
}

/**
 * Navigate to a detail page and confirm it actually loaded by its own `<h1>` — the shape behind
 * crm-ui.spec.ts's `openClient` and candidates-ui.spec.ts's `openCandidate`, which were identical
 * apart from which base path they navigated to.
 */
export async function openDetailPage(page: Page, path: string, name: string): Promise<void> {
  await gotoReady(page, path);
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
}

/**
 * Click `trigger`, then run `assertSettled` — retried together as a UNIT, not the assertion alone.
 *
 * `gotoReady`'s networkidle wait is only a hydration proxy: on a cold CI runner a click can still
 * land before React attaches to a server-rendered control, and the click is dropped silently.
 * Waiting alone after such a click just burns the full timeout on a condition that will never
 * become true, because the click itself never landed — clicking again is the only way out.
 *
 *   await clickUntilSettled(weekRange, () =>
 *     expect(weekRange).toHaveAttribute("aria-checked", "true", { timeout: 2_000 }),
 *   );
 *   await clickUntilSettled(stageTrigger, () => expect(target).toBeVisible({ timeout: 2_000 }));
 */
export async function clickUntilSettled(
  trigger: Locator,
  assertSettled: () => Promise<void>,
  timeout = 30_000,
): Promise<void> {
  await expect(async () => {
    await trigger.click();
    await assertSettled();
  }).toPass({ timeout });
}
