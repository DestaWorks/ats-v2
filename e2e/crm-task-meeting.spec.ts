import { test, expect } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";
import { createClient } from "./fixtures/api";

const TASK_API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3004";

/**
 * CRM tasks + meetings: add a task, toggle it done, log a meeting
 * (`apps/web/src/app/(app)/crm/[id]/tasks-tab.tsx`, `meetings-tab.tsx`). One client fixture for
 * both — they're independent tabs on the same client detail page.
 */
test("adds a task, toggles it done, and logs a meeting", async ({ page, request }) => {
  const clientId = await createClient(request, `E2E Task Client ${Date.now()}`);
  const taskTitle = `E2E Task ${Date.now()}`;

  await gotoReady(page, `/crm/${clientId}`);
  await page.getByRole("tab", { name: "Tasks" }).click();
  await page.getByRole("button", { name: "+ Add Task" }).click();
  await page.getByLabel("Title").fill(taskTitle);
  await page.getByRole("button", { name: "Add Task", exact: true }).click();

  const taskRow = page.locator("li").filter({ hasText: taskTitle });
  await expect(taskRow).toBeVisible();
  await taskRow.getByRole("button", { name: "Mark as done" }).click();

  // A completed task moves into the "N completed tasks" <details>, which is collapsed — its
  // contents are outside the accessibility tree until the summary is opened, so the toggled
  // button is unreachable by role until then.
  await page
    .getByRole("group")
    .filter({ hasText: /completed task/ })
    .getByText(/completed task/)
    .click();
  await expect(
    page.locator("li").filter({ hasText: taskTitle }).getByRole("button", { name: "Mark as open" }),
  ).toBeVisible();

  await page.getByRole("tab", { name: "Meetings" }).click();
  await page.getByRole("button", { name: "+ Log Meeting" }).click();
  await page.getByLabel("Notes").fill(`E2E meeting note ${Date.now()}`);
  await page.getByRole("button", { name: "Log Meeting", exact: true }).click();

  await expect(page.getByText(/E2E meeting note/)).toBeVisible();
});

test("refuses a task with no title", async ({ request }) => {
  const clientId = await createClient(request, `E2E Task Client ${Date.now()}`);

  const response = await request.post(`${TASK_API_BASE}/crm/clients/${clientId}/tasks`, {
    data: { title: "  " },
  });

  expect(response.status()).toBe(422);
});

test("refuses a task status that does not exist", async ({ request }) => {
  const clientId = await createClient(request, `E2E Status Client ${Date.now()}`);
  const created = await request.post(`${TASK_API_BASE}/crm/clients/${clientId}/tasks`, {
    data: { title: `E2E Task ${Date.now()}` },
  });
  expect(created.ok()).toBeTruthy();
  const taskId = (await created.json()).task.id;

  const response = await request.patch(`${TASK_API_BASE}/crm/clients/${clientId}/tasks/${taskId}`, {
    data: { status: "procrastinating" },
  });

  expect(response.status()).toBe(422);
});

test("refuses a meeting with a malformed date", async ({ request }) => {
  const clientId = await createClient(request, `E2E Meeting Client ${Date.now()}`);

  const response = await request.post(`${TASK_API_BASE}/crm/clients/${clientId}/meetings`, {
    data: { title: `E2E Meeting ${Date.now()}`, meetingDate: "not-a-date" },
  });

  expect(response.status()).toBe(422);
});

test("refuses a task on a client that does not exist", async ({ request }) => {
  const response = await request.post(`${TASK_API_BASE}/crm/clients/does-not-exist/tasks`, {
    data: { title: `E2E Ghost Task ${Date.now()}` },
  });

  expect([404, 422]).toContain(response.status());
});

async function detailFor(
  request: import("@playwright/test").APIRequestContext,
  clientId: string,
): Promise<{ tasks: { id: string; title: string; status: string }[]; meetings: { id: string }[] }> {
  const response = await request.get(`${TASK_API_BASE}/crm/clients/${clientId}`);
  return await response.json();
}

test("edits a task and keeps the change", async ({ request }) => {
  const clientId = await createClient(request, `E2E Task Edit ${Date.now()}`);
  const created = await request.post(`${TASK_API_BASE}/crm/clients/${clientId}/tasks`, {
    data: { title: "E2E Original Task" },
  });
  const { task } = (await created.json()) as { task: { id: string } };

  const patched = await request.patch(`${TASK_API_BASE}/crm/clients/${clientId}/tasks/${task.id}`, {
    data: { title: "E2E Updated Task", status: "done" },
  });
  expect(patched.ok()).toBeTruthy();

  const after = (await detailFor(request, clientId)).tasks.find((t) => t.id === task.id);
  expect(after?.title).toBe("E2E Updated Task");
  expect(after?.status).toBe("done");
});

test("deletes a task and it stops coming back", async ({ request }) => {
  const clientId = await createClient(request, `E2E Task Delete ${Date.now()}`);
  const created = await request.post(`${TASK_API_BASE}/crm/clients/${clientId}/tasks`, {
    data: { title: "E2E Doomed Task" },
  });
  const { task } = (await created.json()) as { task: { id: string } };

  const deleted = await request.delete(`${TASK_API_BASE}/crm/clients/${clientId}/tasks/${task.id}`);
  expect(deleted.ok()).toBeTruthy();

  expect((await detailFor(request, clientId)).tasks.map((t) => t.id)).not.toContain(task.id);
});

test("deletes a meeting and it stops coming back", async ({ request }) => {
  const clientId = await createClient(request, `E2E Meeting Delete ${Date.now()}`);
  const created = await request.post(`${TASK_API_BASE}/crm/clients/${clientId}/meetings`, {
    data: { type: "qbr", notes: "E2E meeting to be removed" },
  });
  expect(created.ok()).toBeTruthy();
  const { meeting } = (await created.json()) as { meeting: { id: string } };

  const deleted = await request.delete(
    `${TASK_API_BASE}/crm/clients/${clientId}/meetings/${meeting.id}`,
  );
  expect(deleted.ok()).toBeTruthy();

  expect((await detailFor(request, clientId)).meetings.map((m) => m.id)).not.toContain(meeting.id);
});

test("refuses a task edit that changes nothing", async ({ request }) => {
  const clientId = await createClient(request, `E2E Task No-op ${Date.now()}`);
  const created = await request.post(`${TASK_API_BASE}/crm/clients/${clientId}/tasks`, {
    data: { title: "E2E No-op Task" },
  });
  const { task } = (await created.json()) as { task: { id: string } };

  const response = await request.patch(
    `${TASK_API_BASE}/crm/clients/${clientId}/tasks/${task.id}`,
    { data: {} },
  );

  expect(response.status()).toBe(422);
});
