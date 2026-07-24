import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * `portalAccessRequestService.approve` — creates/links a `ClientContact` and generates a portal
 * link THEN flips status, mirroring the fix-the-legacy-no-op pattern used for staff access
 * requests in Wave 5.3. Deliberately a separate service/model from `access-request.service.ts`.
 */

const h = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
  findById: vi.fn(),
  updateStatus: vi.fn(),
  createContact: vi.fn(),
  generateLink: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/repositories/portal-access-request.repository", () => ({
  portalAccessRequestRepository: {
    create: h.create,
    list: h.list,
    findById: h.findById,
    updateStatus: h.updateStatus,
  },
}));
vi.mock("@/server/repositories/client-contact.repository", () => ({
  clientContactRepository: { create: h.createContact },
}));
vi.mock("@/server/services/client-portal.service", () => ({
  clientPortalService: { generateLink: h.generateLink },
}));

import { portalAccessRequestService } from "./portal-access-request.service";

const actor = { id: "u1", email: "o@desta.works", name: "Owner", role: "Owner" as const };
const pendingRequest = {
  id: "r1",
  name: "Jane Doe",
  email: "jane@acme.health",
  requestedClientName: "Acme Health",
  note: "please",
  status: "pending",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
});

describe("portalAccessRequestService.list", () => {
  it("maps rows to DTOs", async () => {
    h.list.mockResolvedValue([pendingRequest]);
    const result = await portalAccessRequestService.list();
    expect(result).toEqual([
      {
        id: "r1",
        name: "Jane Doe",
        email: "jane@acme.health",
        requestedClientName: "Acme Health",
        note: "please",
        status: "pending",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });
});

describe("portalAccessRequestService.approve", () => {
  it("creates a NEW contact when contactId is omitted, then generates a link, THEN flips status", async () => {
    h.findById.mockResolvedValue(pendingRequest);
    h.createContact.mockResolvedValue({ id: "newcontact" });
    h.generateLink.mockResolvedValue({
      contact: { id: "newcontact", fullName: "Jane Doe" },
      token: "rawtoken",
    });

    const result = await portalAccessRequestService.approve("r1", { clientId: "cl1" }, actor);

    expect(h.createContact).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "cl1", fullName: "Jane Doe", email: "jane@acme.health" }),
    );
    expect(h.generateLink).toHaveBeenCalledWith("cl1", "newcontact", actor);
    const linkOrder = h.generateLink.mock.invocationCallOrder[0] ?? -1;
    const statusOrder = h.updateStatus.mock.invocationCallOrder[0] ?? -1;
    expect(linkOrder).toBeLessThan(statusOrder);
    expect(h.updateStatus).toHaveBeenCalledWith("r1", "approved");
    expect(result.token).toBe("rawtoken");
  });

  it("links to an existing contact when contactId is given (no new contact created)", async () => {
    h.findById.mockResolvedValue(pendingRequest);
    h.generateLink.mockResolvedValue({
      contact: { id: "existing", fullName: "Jane Doe" },
      token: "rawtoken",
    });

    await portalAccessRequestService.approve(
      "r1",
      { clientId: "cl1", contactId: "existing" },
      actor,
    );

    expect(h.createContact).not.toHaveBeenCalled();
    expect(h.generateLink).toHaveBeenCalledWith("cl1", "existing", actor);
  });

  it("404s when the request doesn't exist", async () => {
    h.findById.mockResolvedValue(null);
    await expect(
      portalAccessRequestService.approve("missing", { clientId: "cl1" }, actor),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(h.generateLink).not.toHaveBeenCalled();
  });

  it("409s when already resolved", async () => {
    h.findById.mockResolvedValue({ ...pendingRequest, status: "approved" });
    await expect(
      portalAccessRequestService.approve("r1", { clientId: "cl1" }, actor),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(h.generateLink).not.toHaveBeenCalled();
  });
});

describe("portalAccessRequestService.decline", () => {
  it("flips status to declined", async () => {
    h.findById.mockResolvedValue(pendingRequest);
    await portalAccessRequestService.decline("r1");
    expect(h.updateStatus).toHaveBeenCalledWith("r1", "declined");
  });

  it("404s when missing", async () => {
    h.findById.mockResolvedValue(null);
    await expect(portalAccessRequestService.decline("missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("409s when already resolved", async () => {
    h.findById.mockResolvedValue({ ...pendingRequest, status: "declined" });
    await expect(portalAccessRequestService.decline("r1")).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});
