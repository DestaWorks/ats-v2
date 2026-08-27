import {
  LICENSE_STATUSES,
  TRACKS,
  hasCapability,
  isCandidateStatus,
  type CandidateStatus,
  type LicenseStatus,
  type Track,
} from "@/lib/constants";
import type { ListSort } from "@/lib/validation/pipeline";
import { getVerifiedUser } from "@/server/auth/guards";
import { candidateService } from "@/server/services/candidate.service";
import { savedViewService } from "@/server/services/saved-view.service";
import { SavedViewsBar } from "../lib/saved-views-bar";
import { AddCandidateButton } from "../add-candidate-modal";
import { CandidatesList } from "./candidates-list";
import { ListFilters } from "./list-filters";
import { cachedClientList, cachedUserList } from "@/server/http/request-cache";

/**
 * Candidates browse (RSC) — a searchable, filterable, SERVER OFFSET-paginated flat list, distinct
 * from the funnel board. Guards with `getCurrentUser()` (the `(app)` layout also guards — defence in
 * depth), server-renders the requested page (`candidateService.listCandidates` — no self-fetch;
 * `viewer` drives the license-number gate + resolves `mine`), and seeds the filters from URL
 * `searchParams` so a shared link lands pre-filtered. Every filter/sort/page interaction is a URL
 * change this RSC re-reads — nothing is filtered or paginated client-side.
 */
export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getVerifiedUser();

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
  const rawSort = one(sp.sort);
  const sort: ListSort = rawSort === "oldest" ? "oldest" : rawSort === "fit" ? "fit" : "newest";
  const hot = flag(sp.hot);
  const page = Math.max(1, Number.parseInt(one(sp.page) ?? "", 10) || 1);
  // Added-date range — invalid dates fall back to "no bound" (same tolerance as the other params).
  const date = (v: string | string[] | undefined) => {
    const raw = one(v);
    if (!raw) return undefined;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? undefined : d;
  };

  const clientId = one(sp.clientId);
  const search = one(sp.search);
  const source = one(sp.source);
  const ownerId = one(sp.ownerId);
  const addedFrom = date(sp.addedFrom);
  const addedTo = date(sp.addedTo);

  const [list, clientRows, userRows, savedViews] = await Promise.all([
    candidateService.listCandidates(
      {
        ...(track !== undefined && { track }),
        ...(status !== undefined && { status }),
        ...(clientId !== undefined && { clientId }),
        ...(search !== undefined && { search }),
        ...(tags !== undefined && { tags }),
        ...(licenseStatus !== undefined && { licenseStatus }),
        ...(source !== undefined && { source }),
        ...(ownerId !== undefined && { ownerId }),
        ...(addedFrom !== undefined && { addedFrom }),
        ...(addedTo !== undefined && { addedTo }),
        mine: flag(sp.mine),
        overdue: flag(sp.overdue),
        stuck: flag(sp.stuck),
        hot,
        sort,
        page,
      },
      user,
    ),
    cachedClientList(),
    cachedUserList(),
    savedViewService.list("candidates", user),
  ]);
  const clients = clientRows.map((c) => ({ id: c.id, name: c.name }));
  const owners = userRows.map((u) => ({ id: u.id, name: u.name }));
  const canEditCredential = hasCapability(user.role, "viewCredentials");

  return (
    <div className="flex flex-col gap-5 px-8 py-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Candidates</h1>
          <p className="text-sm text-gray">
            {list.total} {list.total === 1 ? "candidate" : "candidates"}
          </p>
          <p className="text-xs text-gray">Score shown per row.</p>
        </div>
        <AddCandidateButton
          clients={clients}
          canEditCredential={canEditCredential}
          size="sm"
          variant="success"
        />
      </header>

      <ListFilters clients={clients} owners={owners} />
      <SavedViewsBar scope="candidates" initial={savedViews} />

      <CandidatesList list={list} searchParams={sp} />
    </div>
  );
}
