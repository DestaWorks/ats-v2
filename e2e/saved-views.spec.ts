import { test, expect } from "@playwright/test";

const SAVED_VIEWS_API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3004";

async function savedViews(
  request: import("@playwright/test").APIRequestContext,
  scope: string,
): Promise<{ id: string; name: string; query: string }[]> {
  const response = await request.get(`${SAVED_VIEWS_API_BASE}/saved-views?scope=${scope}`);
  expect(response.ok(), `GET /saved-views?scope=${scope}`).toBeTruthy();
  const { savedViews: views } = (await response.json()) as {
    savedViews: { id: string; name: string; query: string }[];
  };
  return views;
}

test("saves a view, lists it, and deletes it again", async ({ request }) => {
  const name = `E2E Saved View ${Date.now()}`;

  const created = await request.post(`${SAVED_VIEWS_API_BASE}/saved-views`, {
    data: { scope: "candidates", name, query: "status=1 - Contacted" },
  });
  expect(created.ok()).toBeTruthy();
  const { savedView } = (await created.json()) as { savedView: { id: string } };

  const listed = await savedViews(request, "candidates");
  expect(listed.map((v) => v.name)).toContain(name);

  const deleted = await request.delete(`${SAVED_VIEWS_API_BASE}/saved-views/${savedView.id}`);
  expect(deleted.ok()).toBeTruthy();

  expect((await savedViews(request, "candidates")).map((v) => v.id)).not.toContain(savedView.id);
});

test("keeps saved views to their own scope", async ({ request }) => {
  const name = `E2E Pipeline View ${Date.now()}`;
  const created = await request.post(`${SAVED_VIEWS_API_BASE}/saved-views`, {
    data: { scope: "pipeline", name, query: "track=Clinical" },
  });
  expect(created.ok()).toBeTruthy();

  expect((await savedViews(request, "pipeline")).map((v) => v.name)).toContain(name);
  expect((await savedViews(request, "candidates")).map((v) => v.name)).not.toContain(name);
});

test("refuses a saved view on a scope that does not exist", async ({ request }) => {
  const response = await request.post(`${SAVED_VIEWS_API_BASE}/saved-views`, {
    data: { scope: "not-a-scope", name: "E2E Bad Scope", query: "" },
  });

  expect(response.status()).toBe(422);
});

test("refuses a saved view with no name", async ({ request }) => {
  const response = await request.post(`${SAVED_VIEWS_API_BASE}/saved-views`, {
    data: { scope: "candidates", name: "", query: "" },
  });

  expect(response.status()).toBe(422);
});
