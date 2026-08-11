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
  findPendingByEmail: vi.fn(),
  updateStatus: vi.fn(),
  adminCreate: vi.fn(),
  sendEmail: vi.fn(),
  findUserByEmail: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/repositories/access-request.repository", () => ({
  accessRequestRepository: {
    create: h.create,
    list: h.list,
    findById: h.findById,
    findPendingByEmail: h.findPendingByEmail,
    updateStatus: h.updateStatus,
  },
}));
vi.mock("@/server/repositories/user.repository", () => ({
  userRepository: { findByEmail: h.findUserByEmail },
}));
vi.mock("@/server/services/admin-user.service", () => ({
  adminUserService: { create: h.adminCreate },
}));
vi.mock("@/server/email/provider", () => ({ sendEmail: h.sendEmail }));

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

describe("accessRequestService.submit", () => {
  const input = {
    name: "Jane Doe",
    email: "jane@example.com",
    organization: "Acme Health",
    message: "Please add me",
  };

  it("creates the request when no pending request exists for this email", async () => {
    h.findPendingByEmail.mockResolvedValue(null);
    h.create.mockResolvedValue(pendingRequest);
    await accessRequestService.submit(input);
    expect(h.findPendingByEmail).toHaveBeenCalledWith("jane@example.com");
    expect(h.create).toHaveBeenCalledWith(input);
  });

  it("409s without creating a second row when a pending request already exists for this email", async () => {
    h.findPendingByEmail.mockResolvedValue(pendingRequest);
    await expect(accessRequestService.submit(input)).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("already have a pending"),
    });
    expect(h.create).not.toHaveBeenCalled();
  });
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
    h.sendEmail.mockResolvedValue({ previewUrl: null });
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

  it("emails the requester their temporary password and a sign-in link", async () => {
    h.findById.mockResolvedValue(pendingRequest);
    h.adminCreate.mockResolvedValue({
      user: { id: "u1", email: "jane@example.com" },
      generatedPassword: "abc123",
    });
    h.sendEmail.mockResolvedValue({ previewUrl: null });
    await accessRequestService.approve("r1", "Associate");
    expect(h.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "jane@example.com",
        subject: expect.stringContaining("approved"),
        html: expect.stringContaining("abc123"),
        text: expect.stringContaining("abc123"),
      }),
    );
  });

  it("still resolves the approval even if the notification email fails to send", async () => {
    h.findById.mockResolvedValue(pendingRequest);
    h.adminCreate.mockResolvedValue({
      user: { id: "u1", email: "jane@example.com" },
      generatedPassword: "abc123",
    });
    h.sendEmail.mockRejectedValue(new Error("SMTP down"));
    const result = await accessRequestService.approve("r1", "Associate");
    expect(result.generatedPassword).toBe("abc123");
    expect(h.updateStatus).toHaveBeenCalledWith("r1", "approved");
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

  // Confirmed live 2026-08-10: a stale pending request whose email already has an account made
  // Better Auth's createUser throw an unmapped error, surfacing as an opaque 500 instead of a
  // clear message. Pre-check and reject with CONFLICT before ever calling adminUserService.create.
  it("409s with a clear message when an account for this email already exists", async () => {
    h.findById.mockResolvedValue(pendingRequest);
    h.findUserByEmail.mockResolvedValue({ id: "existing-user-1" });
    await expect(accessRequestService.approve("r1", "Associate")).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("already exists"),
    });
    expect(h.adminCreate).not.toHaveBeenCalled();
    expect(h.updateStatus).not.toHaveBeenCalled();
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
