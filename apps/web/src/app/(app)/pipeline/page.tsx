import { Suspense } from "react";
import { TRACKS, type Track } from "@destaworks/domain/constants";
import { getVerifiedUser } from "@destaworks/auth/guards";
import type { BoardResponse } from "@destaworks/contracts/validation/pipeline";
// import type { GetSavedViewsResponse } from "@destaworks/contracts/http/saved-view";
import type { LookupOptionsDTO } from "@destaworks/contracts/validation/lookups";
import { Spinner } from "@destaworks/ui/spinner";
import { apiGet, query } from "@/lib/api/server";
import { readSearchParams, type RawSearchParams } from "@/lib/search-params";
import { PipelineBoard } from "./pipeline-board";

/**
 * Pipeline board (RSC). Guards with `getCurrentUser()` (mirrors the dashboard — the `(app)` segment
 * has no shared layout), reads the board server-side through the API, and hands the funnel-grouped
 * `BoardResponse` to the client board. URL `searchParams` seed the initial filtered read so a
 * shared link lands pre-filtered.
 */
export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await getVerifiedUser();

  const q = readSearchParams(await searchParams);
  const track: Track | undefined = q.oneOf("track", TRACKS);

  const clientId = q.str("clientId");
  const search = q.str("search");
  const ownerId = q.str("ownerId");

  // Saved views are hidden for now — the chip row and its `GET /saved-views` read are commented
  // out, not deleted. The API, service and table are untouched, so restoring this is uncommenting
  // these lines. Personal-only views were judged not to earn their place; the shareable version is
  // the one worth building.
  const [board, { clients, users }] = await Promise.all([
    apiGet<BoardResponse>(`/candidates${query({ track, clientId, search, ownerId })}`),
    apiGet<LookupOptionsDTO>("/lookups"),
    // apiGet<GetSavedViewsResponse>(`/saved-views${query({ scope: "pipeline" })}`),
  ]);

  return (
    <div className="flex flex-col gap-5 px-8 py-6">
      <header>
        <h1 className="text-2xl font-bold text-navy">Pipeline</h1>
        <p className="text-sm text-gray">
          {board.meta.active} active · {board.meta.overdue} overdue · {board.meta.stuck} stuck
        </p>
      </header>

      <Suspense
        fallback={
          <div className="flex justify-center py-16">
            <Spinner className="h-6 w-6" />
          </div>
        }
      >
        <PipelineBoard initial={board} clients={clients} owners={users} />
      </Suspense>
    </div>
  );
}
