import "server-only";
import { prisma } from "@/server/db/prisma";

/**
 * Audit-trail data access. Repositories are the ONLY layer that touches Prisma.
 * (Writes happen transactionally via `server/db/audit.ts`; this repo owns reads.)
 */
export const auditRepository = {
  listForEntity(entity: string, entityId: string) {
    return prisma.activityLog.findMany({
      where: { entity, entityId },
      orderBy: { at: "desc" },
    });
  },
};
