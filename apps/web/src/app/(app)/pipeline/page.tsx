import { Suspense } from "react";
import { TRACKS, type Track } from "@destaworks/domain/constants";
import { getVerifiedUser } from "@destaworks/auth/guards";
import type { BoardResponse } from "@destaworks/contracts/validation/pipeline";
import type { GetSavedViewsResponse } from "@destaworks/contracts/http/saved-view";
import type { LookupOptionsDTO } from "@destaworks/contracts/validation/lookups";
import { Spinner } from "@destaworks/ui/spinner";
import { apiGet, query } from "@/lib/api/server";
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
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await getVerifiedUser();

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const rawTrack = one(sp.track);
  const track = TRACKS.includes(rawTrack as Track) ? (rawTrack as Track) : undefined;

  const clientId = one(sp.clientId);
  const search = one(sp.search);
  const ownerId = one(sp.ownerId);

  const [board, { clients, users }, { savedViews }] = await Promise.all([
    apiGet<BoardResponse>(`/candidates${query({ track, clientId, search, ownerId })}`),
    apiGet<LookupOptionsDTO>("/lookups"),
    apiGet<GetSavedViewsResponse>(`/saved-views${query({ scope: "pipeline" })}`),
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
        <PipelineBoard initial={board} clients={clients} owners={users} savedViews={savedViews} />
      </Suspense>
    </div>
  );
}
