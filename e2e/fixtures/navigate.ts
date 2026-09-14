import type { Page } from "@playwright/test";

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
