import { createSavedViewSchema, savedViewListQuerySchema } from "@/lib/validation/saved-view";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { savedViewService } from "@/server/services/saved-view.service";

/**
 * GET /api/saved-views?scope=pipeline|candidates — the caller's saved views for that scope
 * (Wave 2.1 closeout). Guarded by `requireUser()` — every row is filtered by `userId = user.id`
 * server-side, so this can never leak another user's views.
 */
export const GET = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const { scope } = savedViewListQuerySchema.parse({
    scope: new URL(req.url).searchParams.get("scope") ?? undefined,
  });
  const savedViews = await savedViewService.list(scope, user);
  return json({ savedViews });
});

/**
 * POST /api/saved-views — save the current filter state (a raw `searchParams` string) under a
 * name, scoped to one page. 409 CONFLICT if the caller already has a view by that name in that
 * scope.
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const input = createSavedViewSchema.parse(await req.json());
  const savedView = await savedViewService.create(input, user);
  return json({ savedView }, 201);
});
