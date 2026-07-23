/**
 * Saved-view contract (Wave 2.1 closeout) — isomorphic types + zod shared by the saved-view
 * routes and the pipeline/candidates toolbars. A saved view stores the RAW `searchParams`
 * string for its scope's page (no structured/parsed filter shape), so new filter params never
 * need a schema or migration change here — see the "Client-state classification" note in
 * `docs/DECISIONS.md` and the `SavedView` model doc comment in `prisma/schema.prisma`.
 */
import { z } from "zod";
import { SAVED_VIEW_SCOPES, type SavedViewScope } from "@/lib/constants";

export const createSavedViewSchema = z
  .object({
    scope: z.enum(SAVED_VIEW_SCOPES),
    name: z.string().trim().min(1).max(60),
    query: z.string().trim().max(2000),
  })
  .strict();
export type CreateSavedViewInput = z.infer<typeof createSavedViewSchema>;

/** Query for `GET /api/saved-views` — `scope` is required (a view only ever belongs to one page). */
export const savedViewListQuerySchema = z.object({
  scope: z.enum(SAVED_VIEW_SCOPES),
});

export interface SavedViewDTO {
  id: string;
  scope: SavedViewScope;
  name: string;
  query: string;
  createdAt: string; // ISO
}
