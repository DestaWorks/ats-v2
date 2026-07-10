import { CandidateDetail } from "./candidate-detail";
import { loadCandidateDetail } from "./lib/load-detail";

/**
 * Candidate detail — the FULL-PAGE rendering of `/candidates/[id]` (hard load, refresh, new tab,
 * and every deep link: alerts/mentions `?tab=`, promoted-lead links, shared URLs). In-app
 * navigation from the board/list is INTERCEPTED by `(app)/@modal/(.)candidates/[id]` and renders
 * the same content as a dialog over the current view instead (legacy modal UX) — both entries
 * share `loadCandidateDetail`, so data/guards can never drift.
 */
export default async function CandidateDetailPage({
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
    <CandidateDetail
      initial={detail}
      clients={clients}
      taggable={taggable}
      canEditCredential={detail.canVerifyCredentials}
      initialTab={tab}
    />
  );
}
