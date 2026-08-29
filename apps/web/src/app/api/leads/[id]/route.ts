import type { LeadEnvelope } from "@destaworks/contracts/validation/lead";
import type { SoftDeletedResponse } from "@destaworks/contracts/api";
import { requireUser } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { leadService } from "@destaworks/application/lead.service";

/** Response body of `GET /api/leads/:id`. */
export type GetLeadResponse = LeadEnvelope;

/** Response body of `DELETE /api/leads/:id` — the soft-deleted id only, never lead PII. */
export type DeleteLeadResponse = SoftDeletedResponse;

/**
 * GET /api/leads/:id — the full lead detail (list item + sourcing context + attempt log). The
 * outreach-history modal loads it on open. Includes soft-deleted leads (the "Show deleted" view
 * can still inspect them). 401 unauth; 404 missing.
 */
export const GET = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return json<GetLeadResponse>({ lead: await leadService.detail(id, user) });
});

/**
 * DELETE /api/leads/:id — soft-delete a lead (→ reversible trash). Open to any operator
 * (`requireUser`, L-7); no body (id from params). The lead disappears from the `/sourcing` inventory
 * (`deletedAt: null` filter). Returns `{ ok, id }` — never lead PII. 401 unauth; 404 missing /
 * already-deleted (idempotent).
 */
export const DELETE = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const result = await leadService.softDelete(id, user);
  return json<DeleteLeadResponse>({ ok: true, id: result.id });
});
