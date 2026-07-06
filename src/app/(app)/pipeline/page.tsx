import { Suspense } from "react";
import { redirect } from "next/navigation";
import { TRACKS, type Track } from "@/lib/constants";
import { getCurrentUser } from "@/server/auth/guards";
import { candidateService } from "@/server/services/candidate.service";
import { clientRepository } from "@/server/repositories/client.repository";
import { Spinner } from "@/components/ui/spinner";
import { PipelineBoard } from "./pipeline-board";

/**
 * Pipeline board (RSC). Guards with `getCurrentUser()` (mirrors the dashboard — the `(app)` segment
 * has no shared layout), reads the board server-side (direct `candidateService.listBoard` call — no
 * self-fetch), and hands the funnel-grouped `BoardResponse` to the client board. URL `searchParams`
 * seed the initial filtered read so a shared link lands pre-filtered.
 */
export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const rawTrack = one(sp.track);
  const track = TRACKS.includes(rawTrack as Track) ? (rawTrack as Track) : undefined;

  const [board, clientRows] = await Promise.all([
    candidateService.listBoard({ track, clientId: one(sp.clientId), search: one(sp.search) }, user),
    clientRepository.list(),
  ]);
  const clients = clientRows.map((c) => ({ id: c.id, name: c.name }));

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
        <PipelineBoard initial={board} clients={clients} />
      </Suspense>
    </div>
  );
}
