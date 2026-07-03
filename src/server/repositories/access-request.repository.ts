import "server-only";
import { prisma } from "@/server/db/prisma";

/**
 * Access-request data access. Repositories are the ONLY layer that touches Prisma.
 * (Full admin CRUD — list / approve / decline → invite — lands in Wave 5.)
 */
export const accessRequestRepository = {
  create(data: { name: string; email: string; organization?: string; message?: string }) {
    return prisma.accessRequest.create({ data });
  },
};
