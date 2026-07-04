import Link from "next/link";
import { redirect } from "next/navigation";
import { TRACKS, isCandidateStatus, type CandidateStatus, type Track } from "@/lib/constants";
import { getCurrentUser } from "@/server/auth/guards";
import { candidateService } from "@/server/services/candidate.service";
import { clientRepository } from "@/server/repositories/client.repository";
import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "@/components/ui/score-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { ListFilters } from "./list-filters";

/**
 * Candidates browse (RSC) — a searchable, filterable FLAT list of candidates, distinct from the
 * funnel board. Guards with `getCurrentUser()` (the `(app)` layout also guards — defence in depth),
 * reads the PII-gated, capped list directly (`candidateService.listCandidates` — no self-fetch;
 * `viewer` drives the license-number gate), and seeds the filters from URL `searchParams` so a
 * shared link lands pre-filtered. Rows link to the candidate detail page.
 */
export default async function CandidatesPage({
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
  const rawStatus = one(sp.status);
  const status: CandidateStatus | undefined =
    rawStatus && isCandidateStatus(rawStatus) ? rawStatus : undefined;

  const [list, clientRows] = await Promise.all([
    candidateService.listCandidates(
      { track, status, clientId: one(sp.clientId), search: one(sp.search) },
      user,
    ),
    clientRepository.list(),
  ]);
  const clients = clientRows.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Candidates</h1>
          <p className="text-sm text-gray">
            {list.capped
              ? `Showing the first ${list.count} candidates — narrow with filters to find more.`
              : `${list.count} ${list.count === 1 ? "candidate" : "candidates"}`}
          </p>
          <p className="text-xs text-gray">Sorted by fit score — best matches first.</p>
        </div>
        <Link
          href="/candidates/new"
          className="rounded-md bg-navy px-3 py-1.5 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-navy focus-visible:outline-none"
        >
          + Add candidate
        </Link>
      </header>

      <ListFilters clients={clients} />

      {list.candidates.length === 0 ? (
        <EmptyState
          title="No candidates match"
          description="Try clearing or widening the filters, or add a new candidate."
        />
      ) : (
        <Table
          caption="Candidates"
          columns={[
            "Name",
            "Credential",
            "Track",
            "Client",
            "Score",
            "Status",
            "License",
            "Days in stage",
          ]}
        >
          {list.candidates.map((c) => (
            <tr key={c.id} className="transition hover:bg-black/[0.03]">
              <Td>
                <Link
                  href={`/candidates/${c.id}`}
                  className="font-semibold text-navy hover:underline focus-visible:ring-2 focus-visible:ring-navy focus-visible:outline-none"
                >
                  {c.name}
                </Link>
              </Td>
              <Td>{c.credential ?? <span className="text-gray">—</span>}</Td>
              <Td>
                <Badge tone="neutral">{c.track}</Badge>
              </Td>
              <Td>{c.clientName ?? <span className="text-gray italic">Unassigned</span>}</Td>
              <Td>
                <ScoreBadge score={c.score} />
              </Td>
              <Td>{c.statusLabel}</Td>
              <Td>
                <Badge tone={c.licenseStatus === "Active" ? "success" : "neutral"}>
                  {c.licenseStatus}
                </Badge>
              </Td>
              <Td>{c.daysInStage}d</Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
