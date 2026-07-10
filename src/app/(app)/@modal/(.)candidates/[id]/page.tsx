import { CandidateDetail } from "@/app/(app)/candidates/[id]/candidate-detail";
import { RouteModal } from "@/app/(app)/candidates/[id]/route-modal";
import { loadCandidateDetail } from "@/app/(app)/candidates/[id]/lib/load-detail";

/**
 * The route-INTERCEPTED rendering of `/candidates/[id]` — in-app navigation (board card, list
 * row, alerts/mention links) opens the detail as a dialog OVER the current view, which stays
 * mounted underneath (scroll + filters preserved; close = `router.back()`). Hard loads, refreshes
 * and new tabs skip interception and get the full page. Same shared loader → same data, same
 * guards, same PII gating; this route is its own JS chunk, so the board never pays for the detail
 * bundle until a card is actually opened.
 */
export default async function InterceptedCandidateDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const { detail, clients, taggable } = await loadCandidateDetail(id);

  return (
    <RouteModal>
      <CandidateDetail
        initial={detail}
        clients={clients}
        taggable={taggable}
        canEditCredential={detail.canVerifyCredentials}
        initialTab={tab}
      />
    </RouteModal>
  );
}
