import { Controller, Get, Inject, Param, Query, UseGuards } from "@nestjs/common";
import {
  activityQuerySchema,
  type ActivityDetailDTO,
  type ActivityListDTO,
} from "@destaworks/contracts/validation/activity";
import { decodeCursor, type PageCursor } from "@destaworks/contracts/validation/cursor";
import { defined } from "@destaworks/domain/utils/defined";
import { AppError } from "@destaworks/integrations/http/app-error";
import { RequireCapability } from "../../common/decorators/require-capability.decorator";
import { CapabilityGuard } from "../../common/guards/capability.guard";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { ZodValidationPipe, type ContractOutput } from "../../common/pipes/zod-validation.pipe";
import type { ServiceOf } from "../service-token";
import { AUDIT_SERVICE } from "./activity.tokens";

/** The keyset ordering the Activity Log pages by — newest first. */
const ACTIVITY_ORDER = "at_desc";

/**
 * The Activity Log — reads of the `activity_log` audit trail.
 *
 * `viewAudit` is enforced here AND again inside the service (AL-6, server-authoritative). That is
 * deliberate duplication on a compliance surface: the table holds PII under capability-restricted
 * access, so it is the one place where losing a guard at the transport layer must still not open
 * the data.
 *
 * The list carries no raw `before`/`after` snapshots (AL-3) — only `hasChanges`. The PII-bearing
 * blobs load one row at a time from the detail route, so they stay off the always-rendered list.
 */
@Controller("activity")
@UseGuards(SessionAuthGuard, CapabilityGuard)
export class ActivityController {
  constructor(@Inject(AUDIT_SERVICE) private readonly audit: ServiceOf<typeof AUDIT_SERVICE>) {}

  /** One keyset page. The load-more endpoint; the `/activity` page renders the first page itself. */
  @Get()
  @RequireCapability("viewAudit")
  async list(
    @Query(new ZodValidationPipe(activityQuerySchema))
    query: ContractOutput<typeof activityQuerySchema>,
  ): Promise<ActivityListDTO> {
    const { cursor, ...filters } = query;
    return await this.audit.listActivity(defined(filters), this.decodePage(cursor));
  }

  @Get(":id")
  @RequireCapability("viewAudit")
  async detail(@Param("id") id: string): Promise<ActivityDetailDTO> {
    return await this.audit.getActivityDetail(id);
  }

  /** An opaque cursor is either absent or valid — a malformed one is a bad request, not page one. */
  private decodePage(cursor: string | undefined): PageCursor | null {
    if (!cursor) return null;
    const decoded = decodeCursor(cursor, ACTIVITY_ORDER);
    if (!decoded) throw new AppError("BAD_REQUEST", "Invalid cursor");
    return decoded;
  }
}
