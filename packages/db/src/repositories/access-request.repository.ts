import type { TenantContext } from "@destaworks/domain/tenant";
import { db, scopedWrite } from "../tenant-scope";
import { REFERENCE_ROWS_CAP } from "../query-limits";

/**
 * Access-request data access. Repositories are the ONLY layer that touches Prisma.
 */
export const accessRequestRepository = {
  create(
    ctx: TenantContext,
    data: { name: string; email: string; organization?: string; message?: string },
  ) {
    return db(ctx).accessRequest.create({ data: scopedWrite(data) });
  },

  /** Case-insensitive — mirrors `userRepository.findByEmail`. Used to reject a resubmission
   *  while an earlier request from the same email is still pending, rather than piling up
   *  duplicate rows. */
  findPendingByEmail(ctx: TenantContext, email: string) {
    return db(ctx).accessRequest.findFirst({
      where: { email: { equals: email, mode: "insensitive" }, status: "pending" },
    });
  },

  list(ctx: TenantContext) {
    return db(ctx).accessRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: REFERENCE_ROWS_CAP,
    });
  },

  findById(ctx: TenantContext, id: string) {
    return db(ctx).accessRequest.findUnique({ where: { id } });
  },

  updateStatus(ctx: TenantContext, id: string, status: "approved" | "declined") {
    return db(ctx).accessRequest.update({ where: { id }, data: { status } });
  },
};
