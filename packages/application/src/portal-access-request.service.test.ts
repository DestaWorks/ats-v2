import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * `portalAccessRequestService.approve`/`decline` — atomically CLAIM the row (pending → approved/
 * declined) FIRST, before any contact/token side effects, so two concurrent calls can't both pass
 * a "is this still pending?" read and each create a contact + mint a live token (F3). Deliberately
 * a separate service/model from `access-request.service.ts`.
 */

const h = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
  findById: vi.fn(),
  claimPending: vi.fn(),
  revertToPending: vi.fn(),
  createContact: vi.fn(),
  generateLink: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/db/repositories/portal-access-request.repository", () => ({
  portalAccessRequestRepository: {
    create: h.create,
    list: h.list,
    findById: h.findById,
    claimPending: h.claimPending,
    revertToPending: h.revertToPending,
  },
}));
vi.mock("@destaworks/db/repositories/client-contact.repository", () => ({
  clientContactRepository: { create: h.createContact },
}));
vi.mock("./client-portal.service", () => ({
  clientPortalService: { generateLink: h.generateLink },
}));

import { portalAccessRequestService } from "./portal-access-request.service";

const actor = {
  tenantId: "t1",
  membershipId: "u1-m",
  user: { id: "u1", email: "o@desta.works", name: "Owner" },
  role: "Owner" as const,
};
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
  it("claims the row FIRST, then creates a NEW contact when contactId is omitted, then generates a link", async () => {
    h.findById.mockResolvedValue(pendingRequest);
    h.claimPending.mockResolvedValue(1);
    h.createContact.mockResolvedValue({ id: "newcontact" });
    h.generateLink.mockResolvedValue({
      contact: { id: "newcontact", fullName: "Jane Doe" },
      token: "rawtoken",
    });

    const result = await portalAccessRequestService.approve("r1", { clientId: "cl1" }, actor);

    expect(h.claimPending).toHaveBeenCalledWith(actor, "r1", "approved");
    expect(h.createContact).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ clientId: "cl1", fullName: "Jane Doe", email: "jane@acme.health" }),
    );
    expect(h.generateLink).toHaveBeenCalledWith("cl1", "newcontact", actor);
    const claimOrder = h.claimPending.mock.invocationCallOrder[0]!;
    const contactOrder = h.createContact.mock.invocationCallOrder[0]!;
    const linkOrder = h.generateLink.mock.invocationCallOrder[0]!;
    expect(claimOrder).toBeLessThan(contactOrder);
    expect(claimOrder).toBeLessThan(linkOrder);
    expect(result.token).toBe("rawtoken");
  });

  it("links to an existing contact when contactId is given (no new contact created)", async () => {
    h.findById.mockResolvedValue(pendingRequest);
    h.claimPending.mockResolvedValue(1);
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
    expect(h.claimPending).not.toHaveBeenCalled();
    expect(h.generateLink).not.toHaveBeenCalled();
  });

  it("409s when already resolved (claimPending affected 0 rows)", async () => {
    h.findById.mockResolvedValue(pendingRequest);
    h.claimPending.mockResolvedValue(0);
    await expect(
      portalAccessRequestService.approve("r1", { clientId: "cl1" }, actor),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(h.createContact).not.toHaveBeenCalled();
    expect(h.generateLink).not.toHaveBeenCalled();
  });

  it("F3: a TRUE concurrent double-approve (both pass findById) still surfaces a clean CONFLICT for the loser, with no duplicate contact/token", async () => {
    h.findById.mockResolvedValue(pendingRequest);
    h.claimPending.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    h.createContact.mockResolvedValue({ id: "newcontact" });
    h.generateLink.mockResolvedValue({ contact: { id: "newcontact" }, token: "rawtoken" });

    const winner = await portalAccessRequestService.approve("r1", { clientId: "cl1" }, actor);
    expect(winner.token).toBe("rawtoken");

    await expect(
      portalAccessRequestService.approve("r1", { clientId: "cl1" }, actor),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(h.createContact).toHaveBeenCalledTimes(1);
    expect(h.generateLink).toHaveBeenCalledTimes(1);
  });

  it("reverts the claim back to pending if a side effect fails after claiming — retriable, not stuck", async () => {
    h.findById.mockResolvedValue(pendingRequest);
    h.claimPending.mockResolvedValue(1);
    h.createContact.mockResolvedValue({ id: "newcontact" });
    h.generateLink.mockRejectedValue(new Error("contact not in client"));

    await expect(
      portalAccessRequestService.approve("r1", { clientId: "cl1" }, actor),
    ).rejects.toThrow("contact not in client");

    expect(h.revertToPending).toHaveBeenCalledWith(actor, "r1");
  });
});

describe("portalAccessRequestService.decline", () => {
  it("claims the row (pending → declined)", async () => {
    h.findById.mockResolvedValue(pendingRequest);
    h.claimPending.mockResolvedValue(1);
    await portalAccessRequestService.decline("r1");
    expect(h.claimPending).toHaveBeenCalledWith("r1", "declined");
  });

  it("404s when missing", async () => {
    h.findById.mockResolvedValue(null);
    await expect(portalAccessRequestService.decline("missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(h.claimPending).not.toHaveBeenCalled();
  });

  it("409s when already resolved (claimPending affected 0 rows)", async () => {
    h.findById.mockResolvedValue(pendingRequest);
    h.claimPending.mockResolvedValue(0);
    await expect(portalAccessRequestService.decline("r1")).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});
