import { prisma } from "../prisma";

/**
 * Portal-access-request data access (Wave 4.3). Mirrors `access-request.repository.ts`'s shape,
 * but this is a deliberately SEPARATE model — approving one of these grants a `ClientContact` a
 * portal token, never one of the 6 internal RBAC roles.
 */
export const portalAccessRequestRepository = {
  create(data: { name: string; email: string; requestedClientName: string; note?: string | null }) {
    return prisma.portalAccessRequest.create({ data });
  },

  list() {
    return prisma.portalAccessRequest.findMany({ orderBy: { createdAt: "desc" } });
  },

  findById(id: string) {
    return prisma.portalAccessRequest.findUnique({ where: { id } });
  },

  async claimPending(id: string, status: "approved" | "declined") {
    const { count } = await prisma.portalAccessRequest.updateMany({
      where: { id, status: "pending" },
      data: { status },
    });
    return count;
  },

  async revertToPending(id: string) {
    await prisma.portalAccessRequest.updateMany({
      where: { id, status: "approved" },
      data: { status: "pending" },
    });
  },
};
