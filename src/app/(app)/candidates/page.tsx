import { redirect } from "next/navigation";
import {
  LICENSE_STATUSES,
  TRACKS,
  hasCapability,
  isCandidateStatus,
  type CandidateStatus,
  type LicenseStatus,
  type Track,
} from "@/lib/constants";
import { listSortToOrderBy } from "@/lib/validation/pipeline";
import { getCurrentUser } from "@/server/auth/guards";
import { candidateService } from "@/server/services/candidate.service";
import { clientRepository } from "@/server/repositories/client.repository";
import { AddCandidateButton } from "../add-candidate-modal";
import { CandidatesList } from "./candidates-list";
import { ListFilters } from "./list-filters";

/**
 * Candidates browse (RSC) — a searchable, filterable, CURSOR-PAGINATED flat list, distinct from the
 * funnel board. Guards with `getCurrentUser()` (the `(app)` layout also guards — defence in depth),
 * SSR-renders page 1 of the PII-gated list (`candidateService.listCandidates` — no self-fetch;
 * `viewer` drives the license-number gate + resolves `mine`), and seeds the filters from URL
 * `searchParams` so a shared link lands pre-filtered. The client `<CandidatesList>` accumulates
 * further keyset pages (Load more) and owns the page-local fit/hot toggles; it is REMOUNTED whenever
 * a server filter/sort changes (keyed on the filter signature) so it always starts from page 1.
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
  const flag = (v: string | string[] | undefined) => one(v) === "1" || one(v) === "true";

  const rawTrack = one(sp.track);
  const track = TRACKS.includes(rawTrack as Track) ? (rawTrack as Track) : undefined;
  const rawStatus = one(sp.status);
  const status: CandidateStatus | undefined =
    rawStatus && isCandidateStatus(rawStatus) ? rawStatus : undefined;
  const rawLicense = one(sp.licenseStatus);
  const licenseStatus = LICENSE_STATUSES.includes(rawLicense as LicenseStatus)
    ? (rawLicense as LicenseStatus)
    : undefined;
  const tagsRaw = one(sp.tags);
  const tags = tagsRaw
    ? tagsRaw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : undefined;
  const sort = one(sp.sort) === "oldest" ? "oldest" : "newest";

  const [list, clientRows] = await Promise.all([
    candidateService.listCandidates(
      {
        track,
        status,
        clientId: one(sp.clientId),
        search: one(sp.search),
        tags,
        licenseStatus,
        mine: flag(sp.mine),
        overdue: flag(sp.overdue),
        stuck: flag(sp.stuck),
        sort: listSortToOrderBy(sort),
      },
      user,
    ),
    clientRepository.list(),
  ]);
  const clients = clientRows.map((c) => ({ id: c.id, name: c.name }));
  const canEditCredential = hasCapability(user.role, "viewCredentials");

  // Remount the client list whenever a SERVER filter/sort changes so it re-seeds from page 1.
  const listKey = [
    track,
    status,
    one(sp.clientId),
    one(sp.search),
    tags?.join("+"),
    licenseStatus,
    flag(sp.mine),
    flag(sp.overdue),
    flag(sp.stuck),
    sort,
  ].join("|");

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Candidates</h1>
          <p className="text-sm text-gray">
            {list.total} {list.total === 1 ? "candidate" : "candidates"}
          </p>
          <p className="text-xs text-gray">
            {sort === "oldest" ? "Oldest first" : "Newest first"} — score shown per row.
          </p>
        </div>
        <AddCandidateButton clients={clients} canEditCredential={canEditCredential} size="sm" />
      </header>

      <ListFilters clients={clients} />

      <CandidatesList key={listKey} initial={list} />
    </div>
  );
}
