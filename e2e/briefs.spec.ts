import { test, expect } from "@playwright/test";

const BRIEFS_API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3004";

const todayKey = () => new Date().toISOString().slice(0, 10);

function mondayOf(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

const DAILY_BRIEF = {
  headline: "E2E daily headline",
  exceptions: ["E2E exception one", "E2E exception two"],
  yesterdayCheck: [{ associate: "E2E Associate", note: "E2E note" }],
  clientCards: [{ clientName: "E2E Client", summary: "E2E summary" }],
  perAssociate: [{ name: "E2E Associate", todos: ["E2E todo"] }],
  teamPulse: "E2E team pulse",
};

const WEEKLY_BRIEF = {
  headline: "E2E weekly headline",
  kpiNarrative: "E2E KPI narrative",
  clientCards: [{ clientName: "E2E Client", summary: "E2E summary" }],
  perAssociate: [{ name: "E2E Associate", summary: "E2E summary" }],
  lastWeekCheck: [{ item: "E2E item", status: "done" }],
  decisions: ["E2E decision"],
  highlights: "E2E highlights",
  blockers: "E2E blockers",
};

test("saves a daily brief and reads it back", async ({ request }) => {
  const date = todayKey();

  const saved = await request.post(`${BRIEFS_API_BASE}/briefs/daily/save`, {
    data: { ...DAILY_BRIEF, date },
  });
  expect(saved.ok()).toBeTruthy();

  const read = await request.get(`${BRIEFS_API_BASE}/briefs/daily?date=${date}`);
  expect(read.status()).toBe(200);
  expect(JSON.stringify(await read.json())).toContain("E2E daily headline");
});

test("saves a weekly brief and reads it back", async ({ request }) => {
  const weekStart = mondayOf(todayKey());

  const saved = await request.post(`${BRIEFS_API_BASE}/briefs/weekly/save`, {
    data: { ...WEEKLY_BRIEF, weekStart },
  });
  expect(saved.ok()).toBeTruthy();

  const read = await request.get(`${BRIEFS_API_BASE}/briefs/weekly?weekStart=${weekStart}`);
  expect(read.status()).toBe(200);
  expect(JSON.stringify(await read.json())).toContain("E2E weekly headline");
});

test("refuses a daily brief missing its headline", async ({ request }) => {
  const response = await request.post(`${BRIEFS_API_BASE}/briefs/daily/save`, {
    data: { ...DAILY_BRIEF, headline: undefined, date: todayKey() },
  });

  expect(response.status()).toBe(422);
});

test("refuses a weekly brief with a malformed week start", async ({ request }) => {
  const response = await request.post(`${BRIEFS_API_BASE}/briefs/weekly/save`, {
    data: { ...WEEKLY_BRIEF, weekStart: "24-09-2026" },
  });

  expect(response.status()).toBe(422);
});

test("answers an empty daily brief for a day with nothing saved", async ({ request }) => {
  const response = await request.get(`${BRIEFS_API_BASE}/briefs/daily?date=1990-01-01`);

  expect(response.status()).toBe(200);
});

test("refuses generating a brief for a malformed day", async ({ request }) => {
  const response = await request.post(`${BRIEFS_API_BASE}/briefs/daily/generate`, {
    data: { date: "24-09-2026", tz: 0 },
  });

  expect(response.status()).toBe(422);
});

test("refuses weekly patterns for a malformed week start", async ({ request }) => {
  const response = await request.post(`${BRIEFS_API_BASE}/briefs/weekly/patterns`, {
    data: { weekStart: "not-a-date", tz: 0 },
  });

  expect(response.status()).toBe(422);
});

test("refuses suggested targets for a user that is not named", async ({ request }) => {
  const response = await request.post(`${BRIEFS_API_BASE}/targets/suggest`, {
    data: { date: todayKey() },
  });

  expect(response.status()).toBe(422);
});
