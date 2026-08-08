import { updateProspectSchema } from "@/lib/validation/prospect";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { prospectService } from "@/server/services/prospect.service";

/**
 * GET /api/prospects/:id — the full prospect detail (list item + notes + contacts). Includes
 * soft-deleted prospects (the "Show deleted" view can still inspect them). Leadership-gated
 * (`viewClientDiscovery`).
 */
export const GET = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  await requireCapability("viewClientDiscovery");
  const { id } = await ctx.params;
  return json({ prospect: await prospectService.detail(id) });
});

/**
 * PATCH /api/prospects/:id — edit status/owner/notes/website. A converted ("Client") prospect is
 * terminal → 409 CONFLICT.
 */
export const PATCH = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireCapability("viewClientDiscovery");
  const { id } = await ctx.params;
  const input = updateProspectSchema.parse(await req.json());
  const prospect = await prospectService.update(id, input, user);
  return json({ prospect });
});

/**
 * DELETE /api/prospects/:id — soft-delete a prospect (→ reversible trash). Returns `{ ok, id }` —
 * never prospect PII.
 */
export const DELETE = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const user = await requireCapability("viewClientDiscovery");
  const { id } = await ctx.params;
  const result = await prospectService.softDelete(id, user);
  return json({ ok: true, id: result.id });
});
