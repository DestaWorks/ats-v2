import {
  updateProspectSchema,
  type ProspectDetailDTO,
} from "@destaworks/contracts/validation/prospect";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { prospectService } from "@destaworks/application/prospect.service";

/** Response body of `GET /api/prospects/:id`. */
export type GetProspectResponse = { prospect: ProspectDetailDTO };

/** Response body of `PATCH /api/prospects/:id`. */
export type PatchProspectResponse = { prospect: ProspectDetailDTO };

/** Response body of `DELETE /api/prospects/:id` — the soft-deleted id only, never prospect PII. */
export type DeleteProspectResponse = { ok: true; id: string };

/**
 * GET /api/prospects/:id — the full prospect detail (list item + notes + contacts). Includes
 * soft-deleted prospects (the "Show deleted" view can still inspect them). Leadership-gated
 * (`viewClientDiscovery`).
 */
export const GET = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  await requireCapability("viewClientDiscovery");
  const { id } = await ctx.params;
  return json<GetProspectResponse>({ prospect: await prospectService.detail(id) });
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
  return json<PatchProspectResponse>({ prospect });
});

/**
 * DELETE /api/prospects/:id — soft-delete a prospect (→ reversible trash). Returns `{ ok, id }` —
 * never prospect PII.
 */
export const DELETE = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const user = await requireCapability("viewClientDiscovery");
  const { id } = await ctx.params;
  const result = await prospectService.softDelete(id, user);
  return json<DeleteProspectResponse>({ ok: true, id: result.id });
});
