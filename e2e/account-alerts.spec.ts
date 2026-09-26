import { test, expect } from "@playwright/test";

const ACCOUNT_API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3004";

test("answers who the session user is", async ({ request }) => {
  const response = await request.get(`${ACCOUNT_API_BASE}/me`);

  expect(response.status()).toBe(200);
  const me = (await response.json()) as { id: string; email: string };
  expect(me.id).toBeTruthy();
  expect(me.email).toBe(process.env["SEED_OWNER_EMAIL"] ?? "owner@e2e.local");
});

test("loads the alerts feed", async ({ request }) => {
  const response = await request.get(`${ACCOUNT_API_BASE}/alerts`);

  expect(response.status()).toBe(200);
});

test("loads mentions and marks them all read", async ({ request }) => {
  const listed = await request.get(`${ACCOUNT_API_BASE}/mentions`);
  expect(listed.status()).toBe(200);

  const marked = await request.post(`${ACCOUNT_API_BASE}/mentions/read`, { data: { all: true } });
  expect(marked.status()).toBe(200);
  const { unread } = (await marked.json()) as { unread: number };
  expect(unread).toBe(0);
});

test("refuses marking a mention read with neither an id nor all", async ({ request }) => {
  const response = await request.post(`${ACCOUNT_API_BASE}/mentions/read`, { data: {} });

  expect(response.status()).toBe(422);
});

test("reads and writes learn progress", async ({ request }) => {
  const before = await request.get(`${ACCOUNT_API_BASE}/me/learn-progress`);
  expect(before.status()).toBe(200);

  const updated = await request.patch(`${ACCOUNT_API_BASE}/me/learn-progress`, {
    data: { chapterId: "overview", done: true },
  });
  expect(updated.ok()).toBeTruthy();

  const after = await request.get(`${ACCOUNT_API_BASE}/me/learn-progress`);
  const progress = (await after.json()) as { chapters?: Record<string, boolean> };
  expect(JSON.stringify(progress)).toContain("overview");
});

test("refuses learn progress on a chapter that does not exist", async ({ request }) => {
  const response = await request.patch(`${ACCOUNT_API_BASE}/me/learn-progress`, {
    data: { chapterId: "not-a-chapter", done: true },
  });

  expect(response.status()).toBe(422);
});

test("refuses an avatar upload with no file", async ({ request }) => {
  const response = await request.post(`${ACCOUNT_API_BASE}/me/avatar`, { data: {} });

  expect(response.ok()).toBeFalsy();
});
