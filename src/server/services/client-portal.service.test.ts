import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * `clientPortalService` — Wave 4.3. The two most security-critical behaviors to prove: generating
 * a link revokes any prior one FIRST (one live link per contact), and `data()`/`postRole()` never
 * accept a client-supplied clientId/contactId — both always come from the caller's resolved
 * `PortalContext` argument.
 */

const h = vi.hoisted(() => ({
  findByIdContact: vi.fn(),
  updateContact: vi.fn(),
  listForClientContact: vi.fn(),
  createTokenRow: vi.fn(),
  revokeAllForContact: vi.fn(),
  revoke: vi.fn(),
  findActiveForContact: vi.fn(),
  findByIdToken: vi.fn(),
  findByIdClient: vi.fn(),
  listCandidates: vi.fn(),
  listRoles: vi.fn(),
  createRole: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/prisma", () => ({ prisma: {}, db: () => ({}) }));
vi.mock("@/server/db/with-transaction", () => ({
  withTransaction: async (fn: (tx: unknown) => unknown) => fn({}),
}));
vi.mock("@/server/db/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/server/repositories/client-contact.repository", () => ({
  clientContactRepository: { findById: h.findByIdContact, update: h.updateContact },
}));
vi.mock("@/server/repositories/client-portal-token.repository", () => ({
  clientPortalTokenRepository: {
    create: h.createTokenRow,
    revokeAllForContact: h.revokeAllForContact,
    revoke: h.revoke,
    findActiveForContact: h.findActiveForContact,
    findById: h.findByIdToken,
  },
}));
vi.mock("@/server/repositories/client.repository", () => ({
  clientRepository: { findById: h.findByIdClient },
}));
vi.mock("@/server/repositories/candidate.repository", () => ({
  candidateRepository: { list: h.listCandidates },
}));
vi.mock("@/server/repositories/open-role.repository", () => ({
  openRoleRepository: { list: h.listRoles, create: h.createRole },
}));

import { clientPortalService } from "./client-portal.service";

const actor = { id: "u1", email: "o@desta.works", name: "Owner", role: "Owner" as const };
const contact = {
  id: "c1",
  clientId: "cl1",
  fullName: "Jane Doe",
  email: "jane@acme.health",
  portalEnabled: false,
  deletedAt: null,
};

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
});

describe("clientPortalService.generateLink", () => {
  it("revokes prior tokens BEFORE creating a new one, and enables the contact", async () => {
    h.findByIdContact.mockResolvedValue(contact);
    h.createTokenRow.mockResolvedValue({
      id: "t1",
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 1000),
      lastUsedAt: null,
      revokedAt: null,
    });
    h.updateContact.mockResolvedValue(1);
    h.findByIdContact.mockResolvedValueOnce(contact).mockResolvedValueOnce({
      ...contact,
      portalEnabled: true,
    });

    const result = await clientPortalService.generateLink("cl1", "c1", actor);

    const revokeOrder = h.revokeAllForContact.mock.invocationCallOrder[0] ?? -1;
    const createOrder = h.createTokenRow.mock.invocationCallOrder[0] ?? -1;
    expect(revokeOrder).toBeLessThan(createOrder);
    expect(h.revokeAllForContact).toHaveBeenCalledWith("c1", expect.anything());
    expect(h.updateContact).toHaveBeenCalledWith(
      "cl1",
      "c1",
      { portalEnabled: true },
      expect.anything(),
    );
    expect(result.token).toEqual(expect.any(String));
    expect(result.contact.portalEnabled).toBe(true);
  });

  it("404s when the contact doesn't belong to the given client", async () => {
    h.findByIdContact.mockResolvedValue({ ...contact, clientId: "other-client" });
    await expect(clientPortalService.generateLink("cl1", "c1", actor)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(h.createTokenRow).not.toHaveBeenCalled();
  });
});

describe("clientPortalService.revokeLink", () => {
  it("404s when the token's contact doesn't belong to the given client", async () => {
    h.findByIdToken.mockResolvedValue({
      id: "t1",
      contactId: "c1",
      contact: { clientId: "other" },
    });
    await expect(clientPortalService.revokeLink("cl1", "t1", actor)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(h.revoke).not.toHaveBeenCalled();
  });

  it("revokes when scoped correctly", async () => {
    h.findByIdToken.mockResolvedValue({ id: "t1", contactId: "c1", contact: { clientId: "cl1" } });
    h.revoke.mockResolvedValue(1);
    await clientPortalService.revokeLink("cl1", "t1", actor);
    expect(h.revoke).toHaveBeenCalledWith("t1", expect.anything());
  });
});

describe("clientPortalService.data", () => {
  it("uses ONLY the resolved PortalContext's clientId — never a client-supplied value", async () => {
    h.findByIdClient.mockResolvedValue({ id: "cl1", name: "Acme Health" });
    h.listCandidates.mockResolvedValue([
      {
        id: "cand1",
        name: "Sam",
        credential: "PMHNP",
        licenseState: "CA",
        status: "SUBMITTED_TO_CLIENT",
        city: "LA",
        state: "CA",
        yearsExp: 5,
        employer: "Prev Co",
      },
    ]);
    h.listRoles.mockResolvedValue([
      {
        id: "r1",
        title: "NP",
        credential: "PMHNP",
        state: "CA",
        city: "LA",
        setting: "Outpatient",
        rate: "$80/hr",
        description: "desc",
        priority: "P2",
        status: "Open",
        openedAt: new Date(),
      },
      {
        id: "r2",
        title: "Closed role",
        credential: null,
        state: null,
        city: null,
        setting: null,
        rate: null,
        description: null,
        priority: "P2",
        status: "Closed",
        openedAt: new Date(),
      },
    ]);

    const ctx = { contactId: "c1", clientId: "cl1", fullName: "Jane Doe", email: "jane@x.com" };
    const result = await clientPortalService.data(ctx);

    expect(h.listCandidates).toHaveBeenCalledWith(expect.objectContaining({ clientId: "cl1" }));
    expect(h.listRoles).toHaveBeenCalledWith(expect.objectContaining({ clientId: "cl1" }));
    expect(result.roles).toHaveLength(1); // Closed role filtered out
    expect(result.candidates[0]).not.toHaveProperty("email");
    expect(result.candidates[0]).not.toHaveProperty("licenseNumber");
  });
});

describe("clientPortalService.postRole", () => {
  it("server-sets clientId/postedByContactId from the PortalContext, never the input", async () => {
    h.createRole.mockResolvedValue({ id: "newrole" });
    const ctx = { contactId: "c1", clientId: "cl1", fullName: "Jane Doe", email: null };
    const result = await clientPortalService.postRole(ctx, { title: "NP", priority: "P2" });
    expect(h.createRole).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "cl1", postedByContactId: "c1", status: "Open" }),
      expect.anything(),
    );
    expect(result).toEqual({ id: "newrole" });
  });
});
