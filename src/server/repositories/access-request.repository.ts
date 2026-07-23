import "server-only";
import { prisma } from "@/server/db/prisma";

/**
 * Access-request data access. Repositories are the ONLY layer that touches Prisma.
 */
export const accessRequestRepository = {
  create(data: { name: string; email: string; organization?: string; message?: string }) {
    return prisma.accessRequest.create({ data });
  },

  list() {
    return prisma.accessRequest.findMany({ orderBy: { createdAt: "desc" } });
  },

  findById(id: string) {
    return prisma.accessRequest.findUnique({ where: { id } });
  },

  updateStatus(id: string, status: "approved" | "declined") {
    return prisma.accessRequest.update({ where: { id }, data: { status } });
  },
};
