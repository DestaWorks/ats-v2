import { describe, it, expect, beforeEach, vi } from "vitest";
import { AppError } from "@/server/http/app-error";

/**
 * PATCH/DELETE /api/crm/clients/:id/tasks/:taskId — gated `requireCapability("viewCrm")`:
 * unauth → 401; non-viewCrm role → 403; leadership → 200; a task belonging to another client
 * (or missing) → 404.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  updateTask: vi.fn(),
  removeTask: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/client.service", () => ({
  clientService: { updateTask: h.updateTask, removeTask: h.removeTask },
}));

import { PATCH, DELETE } from "./route";

const ctx = { params: Promise.resolve({ id: "c1", taskId: "ct1" }) };
function patchReq(body: unknown) {
  return new Request("http://localhost/api/crm/clients/c1/tasks/ct1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
const deleteReq = () =>
  new Request("http://localhost/api/crm/clients/c1/tasks/ct1", { method: "DELETE" });

beforeEach(() => {
  h.session = null;
  h.updateTask.mockReset();
  h.removeTask.mockReset();
});

describe("PATCH /api/crm/clients/:id/tasks/:taskId", () => {
  it("401 when signed out and does not update", async () => {
    const res = await PATCH(patchReq({ status: "done" }), ctx);
    expect(res.status).toBe(401);
    expect(h.updateTask).not.toHaveBeenCalled();
  });

  it("403 for a non-viewCrm role (Screener)", async () => {
    h.session = { user: { id: "u2", email: "s@desta.works", name: "S", role: "Screener" } };
    const res = await PATCH(patchReq({ status: "done" }), ctx);
    expect(res.status).toBe(403);
    expect(h.updateTask).not.toHaveBeenCalled();
  });

  it("200 for a leadership role (Owner) — forwards id + taskId + validated input", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.updateTask.mockResolvedValue({ id: "ct1", status: "done" });
    const res = await PATCH(patchReq({ status: "done" }), ctx);
    expect(res.status).toBe(200);
    expect(h.updateTask).toHaveBeenCalledWith(
      "c1",
      "ct1",
      expect.objectContaining({ status: "done" }),
      expect.objectContaining({ id: "u1" }),
    );
  });

  it("maps a service NOT_FOUND to 404", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.updateTask.mockRejectedValue(new AppError("NOT_FOUND", "Task not found"));
    const res = await PATCH(patchReq({ status: "done" }), ctx);
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/crm/clients/:id/tasks/:taskId", () => {
  it("401 when signed out and does not delete", async () => {
    const res = await DELETE(deleteReq(), ctx);
    expect(res.status).toBe(401);
    expect(h.removeTask).not.toHaveBeenCalled();
  });

  it("403 for a non-viewCrm role (Associate)", async () => {
    h.session = { user: { id: "u2", email: "a@desta.works", name: "A", role: "Associate" } };
    const res = await DELETE(deleteReq(), ctx);
    expect(res.status).toBe(403);
    expect(h.removeTask).not.toHaveBeenCalled();
  });

  it("200 for a leadership role (Owner)", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.removeTask.mockResolvedValue(undefined);
    const res = await DELETE(deleteReq(), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: "ct1" });
    expect(h.removeTask).toHaveBeenCalledWith("c1", "ct1", expect.objectContaining({ id: "u1" }));
  });
});
