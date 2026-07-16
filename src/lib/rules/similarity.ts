/**
 * Provider similarity scoring (Wave 3.2, Smarter Sourcing) — PURE + ISOMORPHIC (no `server-only`).
 * Net-new: no legacy precedent exists for provider-to-provider similarity (the only "similarity"
 * legacy code, `handleClientDiscoveryAiScore_`, scores prospective agency clients, not providers).
 *
 * NPPES results carry only credential (via taxonomy, hard-filtered before this ever runs) and
 * state — no `population`/`setting` data is available on external NPPES rows, so state proximity
 * is the only scored dimension. Tiers: exact state match, both anchor and result states are NLC
 * compact members (mutual multi-state practice eligibility — a real reason to treat them as close,
 * not an arbitrary bucket), else a lower-but-still-included tier (never excluded outright — the
 * dedupe/"net-new" filter is a separate, harder gate upstream of this score).
 */
import { isCompactState } from "@/lib/constants/states";

export function scoreStateSimilarity(
  anchorState: string | null,
  resultState: string | null,
): number {
  if (anchorState && resultState && anchorState === resultState) return 100;
  if (anchorState && resultState && isCompactState(anchorState) && isCompactState(resultState)) {
    return 60;
  }
  return 30;
}
