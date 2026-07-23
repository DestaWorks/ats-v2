import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * `accessRequestService.approve` fixes a confirmed legacy bug (`approve_request` had no backend
 * handler at all, so status never flipped) — creates the account via `adminUserService.create`
 * THEN flips status. `decline` just flips status. Both repository + adminUserService are mocked.
 */

const h = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
  findById: vi.fn(),
  updateStatus: vi.fn(),
  adminCreate: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/repositories/access-request.repository", () => ({
  accessRequestRepository: {
    create: h.create,
    list: h.list,
    findById: h.findById,
    updateStatus: h.updateStatus,
  },
}));
vi.mock("@/server/services/admin-user.service", () => ({
  adminUserService: { create: h.adminCreate },
}));

import { accessRequestService } from "./access-request.service";

const pendingRequest = {
  id: "r1",
  name: "Jane Doe",
  email: "jane@example.com",
  organization: "Acme Health",
  message: "Please add me",
  status: "pending",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
});

describe("accessRequestService.list", () => {
  it("maps rows to DTOs", async () => {
    h.list.mockResolvedValue([pendingRequest]);
    const result = await accessRequestService.list();
    expect(result).toEqual([
      {
        id: "r1",
        name: "Jane Doe",
        email: "jane@example.com",
        organization: "Acme Health",
        message: "Please add me",
        status: "pending",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });
});

describe("accessRequestService.approve", () => {
  it("creates the user via adminUserService THEN flips status to approved", async () => {
    h.findById.mockResolvedValue(pendingRequest);
    h.adminCreate.mockResolvedValue({
      user: { id: "u1", email: "jane@example.com" },
      generatedPassword: "abc123",
    });
    const result = await accessRequestService.approve("r1", "Associate");
    expect(h.adminCreate).toHaveBeenCalledWith({
      name: "Jane Doe",
      email: "jane@example.com",
      role: "Associate",
    });
    expect(h.updateStatus).toHaveBeenCalledWith("r1", "approved");
    // Both happen, and creation happens BEFORE the status flip.
    const createOrder = h.adminCreate.mock.invocationCallOrder[0] ?? -1;
    const statusOrder = h.updateStatus.mock.invocationCallOrder[0] ?? -1;
    expect(createOrder).toBeLessThan(statusOrder);
    expect(result.generatedPassword).toBe("abc123");
  });

  it("404s when the request doesn't exist", async () => {
    h.findById.mockResolvedValue(null);
    await expect(accessRequestService.approve("missing", "Associate")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(h.adminCreate).not.toHaveBeenCalled();
  });

  it("409s when the request was already resolved", async () => {
    h.findById.mockResolvedValue({ ...pendingRequest, status: "approved" });
    await expect(accessRequestService.approve("r1", "Associate")).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(h.adminCreate).not.toHaveBeenCalled();
  });
});

describe("accessRequestService.decline", () => {
  it("flips status to declined", async () => {
    h.findById.mockResolvedValue(pendingRequest);
    await accessRequestService.decline("r1");
    expect(h.updateStatus).toHaveBeenCalledWith("r1", "declined");
  });

  it("404s when the request doesn't exist", async () => {
    h.findById.mockResolvedValue(null);
    await expect(accessRequestService.decline("missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("409s when already resolved", async () => {
    h.findById.mockResolvedValue({ ...pendingRequest, status: "declined" });
    await expect(accessRequestService.decline("r1")).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
