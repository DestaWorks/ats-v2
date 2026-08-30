import type { TenantContext } from "@destaworks/domain/tenant";
import { db, scopedWrite } from "../tenant-scope";
import { REFERENCE_ROWS_CAP } from "../query-limits";

/**
 * Portal-access-request data access (Wave 4.3). Mirrors `access-request.repository.ts`'s shape,
 * but this is a deliberately SEPARATE model — approving one of these grants a `ClientContact` a
 * portal token, never one of the 6 internal RBAC roles.
 */
export const portalAccessRequestRepository = {
  create(
    ctx: TenantContext,
    data: { name: string; email: string; requestedClientName: string; note?: string | null },
  ) {
    return db(ctx).portalAccessRequest.create({ data: scopedWrite(data) });
  },

  list(ctx: TenantContext) {
    return db(ctx).portalAccessRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: REFERENCE_ROWS_CAP,
    });
  },

  findById(ctx: TenantContext, id: string) {
    return db(ctx).portalAccessRequest.findUnique({ where: { id } });
  },

  async claimPending(ctx: TenantContext, id: string, status: "approved" | "declined") {
    const { count } = await db(ctx).portalAccessRequest.updateMany({
      where: { id, status: "pending" },
      data: { status },
    });
    return count;
  },

  async revertToPending(ctx: TenantContext, id: string) {
    await db(ctx).portalAccessRequest.updateMany({
      where: { id, status: "approved" },
      data: { status: "pending" },
    });
  },
};
