import {
  LICENSE_STATUSES,
  TRACKS,
  hasCapability,
  isCandidateStatus,
  type CandidateStatus,
  type LicenseStatus,
  type Track,
} from "@destaworks/domain/constants";
import type { CandidateListDTO } from "@destaworks/contracts/validation/candidate";
import type { ListSort } from "@destaworks/contracts/validation/pipeline";
import type { GetSavedViewsResponse } from "@destaworks/contracts/http/saved-view";
import type { LookupOptionsDTO } from "@destaworks/contracts/validation/lookups";
import { getVerifiedUser } from "@destaworks/auth/guards";
import { apiGet, query } from "@/lib/api/server";
import { readSearchParams, type RawSearchParams } from "@/lib/search-params";
import { SavedViewsBar } from "../lib/saved-views-bar";
import { AddCandidateButton } from "../add-candidate-modal";
import { CandidatesList } from "./candidates-list";
import { ListFilters } from "./list-filters";

/**
 * Candidates browse (RSC) — a searchable, filterable, SERVER OFFSET-paginated flat list, distinct
 * from the funnel board. Guards with `getCurrentUser()` (the `(app)` layout also guards — defence in
 * depth), server-renders the requested page through the API (the session forwarded with the read
 * drives the license-number gate + resolves `mine`), and seeds the filters from URL `searchParams`
 * so a shared link lands pre-filtered. Every filter/sort/page interaction is a URL change this RSC
 * re-reads — nothing is filtered or paginated client-side.
 */
export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await getVerifiedUser();

  const q = readSearchParams(await searchParams);

  const track: Track | undefined = q.oneOf("track", TRACKS);
  const status: CandidateStatus | undefined = q.guarded("status", isCandidateStatus);
  const licenseStatus: LicenseStatus | undefined = q.oneOf("licenseStatus", LICENSE_STATUSES);
  const tags = q.csv("tags");
  const rawSort = q.str("sort");
  const sort: ListSort = rawSort === "oldest" ? "oldest" : rawSort === "fit" ? "fit" : "newest";
  const hot = q.flagLoose("hot");
  const page = q.page();

  const clientId = q.str("clientId");
  const search = q.str("search");
  const source = q.str("source");
  const ownerId = q.str("ownerId");
  const addedFrom = q.date("addedFrom");
  const addedTo = q.date("addedTo");

  const [list, { clients, users }, { savedViews }] = await Promise.all([
    apiGet<CandidateListDTO>(
      `/candidates/list${query({
        track,
        status,
        clientId,
        search,
        tags: tags?.join(","),
        licenseStatus,
        source,
        ownerId,
        addedFrom: addedFrom?.toISOString(),
        addedTo: addedTo?.toISOString(),
        mine: q.flagLoose("mine"),
        overdue: q.flagLoose("overdue"),
        stuck: q.flagLoose("stuck"),
        hot,
        sort,
        page,
      })}`,
    ),
    apiGet<LookupOptionsDTO>("/lookups"),
    apiGet<GetSavedViewsResponse>(`/saved-views${query({ scope: "candidates" })}`),
  ]);
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

      <ListFilters clients={clients} owners={users} />
      <SavedViewsBar scope="candidates" initial={savedViews} />

      <CandidatesList list={list} searchParams={q.raw} />
    </div>
  );
}
