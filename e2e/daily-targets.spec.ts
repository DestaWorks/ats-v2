import { test, expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";

const TARGETS_API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3004";

const todayKey = () => new Date().toISOString().slice(0, 10);

function mondayOf(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  const shift = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - shift);
  return date.toISOString().slice(0, 10);
}

async function meId(request: APIRequestContext): Promise<string> {
  const response = await request.get(`${TARGETS_API_BASE}/me`);
  expect(response.ok(), "GET /me").toBeTruthy();
  const { id } = (await response.json()) as { id: string };
  return id;
}

const FIVE = { sourcing: 5, outreach: 5, atsCleanup: 5, inbound: 5, screens: 5 };

test("sets a daily target and reads it back on the overview", async ({ request }) => {
  const date = todayKey();
  const response = await request.post(`${TARGETS_API_BASE}/daily/targets`, {
    data: { userId: await meId(request), date, ...FIVE, priorityRole: "E2E Priority Role" },
  });
  expect(response.ok()).toBeTruthy();

  const overview = await request.get(`${TARGETS_API_BASE}/daily/overview?date=${date}&tz=0`);
  expect(overview.status()).toBe(200);
});

test("refuses a target beyond the allowed range", async ({ request }) => {
  const response = await request.post(`${TARGETS_API_BASE}/daily/targets`, {
    data: { userId: await meId(request), date: todayKey(), ...FIVE, sourcing: 9999 },
  });

  expect(response.status()).toBe(422);
});

test("saves end-of-shift actuals", async ({ request }) => {
  const response = await request.post(`${TARGETS_API_BASE}/daily/actuals`, {
    data: {
      date: todayKey(),
      sourcing: 4,
      outreach: 6,
      atsCleanup: 2,
      inbound: 1,
      screens: 3,
      note: "E2E end of shift",
    },
  });

  expect(response.ok()).toBeTruthy();
});

test("refuses actuals with a negative count", async ({ request }) => {
  const response = await request.post(`${TARGETS_API_BASE}/daily/actuals`, {
    data: { date: todayKey(), sourcing: -1, outreach: 0, atsCleanup: 0, inbound: 0, screens: 0 },
  });

  expect(response.status()).toBe(422);
});

test("adds a journal entry for the day", async ({ request }) => {
  const response = await request.post(`${TARGETS_API_BASE}/daily/journal/entries`, {
    data: { date: todayKey(), text: `E2E journal entry ${Date.now()}` },
  });

  expect(response.ok()).toBeTruthy();
});

test("refuses a journal entry with no text", async ({ request }) => {
  const response = await request.post(`${TARGETS_API_BASE}/daily/journal/entries`, {
    data: { date: todayKey(), text: "" },
  });

  expect(response.status()).toBe(422);
});

test("adds a weekly goal and toggles it done", async ({ request }) => {
  const added = await request.post(`${TARGETS_API_BASE}/daily/journal/goals`, {
    data: { weekStart: mondayOf(todayKey()), text: `E2E weekly goal ${Date.now()}` },
  });
  expect(added.ok()).toBeTruthy();
  const { goal } = (await added.json()) as { goal: { id: string } };

  const toggled = await request.patch(`${TARGETS_API_BASE}/daily/journal/goals/${goal.id}`, {
    data: { done: true },
  });

  expect(toggled.ok()).toBeTruthy();
});

test("answers 404 for a weekly goal that is not yours", async ({ request }) => {
  const response = await request.patch(`${TARGETS_API_BASE}/daily/journal/goals/does-not-exist`, {
    data: { done: true },
  });

  expect(response.status()).toBe(404);
});

test("leaves manager feedback on a teammate's day", async ({ request }) => {
  const response = await request.post(`${TARGETS_API_BASE}/daily/manager-feedback`, {
    data: { userId: await meId(request), body: `E2E manager feedback ${Date.now()}` },
  });

  expect(response.ok()).toBeTruthy();
});

test("refuses manager feedback with no body", async ({ request }) => {
  const response = await request.post(`${TARGETS_API_BASE}/daily/manager-feedback`, {
    data: { userId: await meId(request), body: "" },
  });

  expect(response.status()).toBe(422);
});

test("loads the recap and the team breakdown", async ({ request }) => {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const recap = await request.get(`${TARGETS_API_BASE}/daily/recap?since=${since}`);
  expect(recap.status()).toBe(200);

  const breakdown = await request.get(
    `${TARGETS_API_BASE}/daily/team-breakdown?weekStart=${mondayOf(todayKey())}`,
  );
  expect(breakdown.status()).toBe(200);
});

test("refuses a recap with a malformed since", async ({ request }) => {
  const response = await request.get(`${TARGETS_API_BASE}/daily/recap?since=not-a-date`);

  expect(response.status()).toBe(422);
});

test("renders the team brief page", async ({ page }) => {
  await gotoReady(page, "/daily-brief");

  await expect(page.locator("body")).not.toContainText("You don't have access");
});
