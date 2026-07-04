import { Suspense } from "react";
import Link from "next/link";
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
    <main className="mx-auto flex max-w-[1600px] flex-col gap-5 p-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Pipeline</h1>
          <p className="text-sm text-gray">
            {board.meta.active} active · {board.meta.overdue} overdue · {board.meta.stuck} stuck
          </p>
        </div>
        {/* Anchors (next/link), not <button>s — kept inline; mirror the primary/secondary sm Button look. */}
        <div className="flex items-center gap-2">
          <Link
            href="/candidates/new"
            className="rounded-md bg-navy px-3 py-1.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            + Add candidate
          </Link>
          <Link
            href="/dashboard"
            className="rounded-md border border-black/15 px-3 py-1.5 text-sm font-semibold text-charcoal transition hover:bg-black/5"
          >
            Dashboard
          </Link>
        </div>
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
    </main>
  );
}
