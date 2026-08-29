import "server-only";
import { notFound } from "next/navigation";
import { getVerifiedUser } from "@destaworks/auth/guards";
import type { GetCandidateDetailPageResponse } from "@destaworks/contracts/validation/candidate";
import { AppError } from "@destaworks/integrations/http/app-error";
import { apiGet } from "@/lib/api/server";

/**
 * Shared RSC loader for the candidate detail — used by BOTH renderings of `/candidates/[id]`:
 * the full page (hard load / deep link) and the route-INTERCEPTED modal (in-app navigation from
 * the board/list). One place owns the guard → composite-read → NOT_FOUND mapping so the two
 * entries can never drift. Returns everything `<CandidateDetail>` needs.
 *
 * The three parallel in-process reads this used to make are now ONE request: `GET
 * /candidates/:id/detail` answers the candidate composite, the client and @mention option lists
 * and the storage flag together (SAAS-RESTRUCTURE-PLAN 4.0 — a composite read becomes a composite
 * endpoint, not N round trips).
 */
export async function loadCandidateDetail(id: string) {
  await getVerifiedUser();

  try {
    return await apiGet<GetCandidateDetailPageResponse>(
      `/candidates/${encodeURIComponent(id)}/detail`,
    );
  } catch (err) {
    if (err instanceof AppError && err.code === "NOT_FOUND") notFound();
    throw err;
  }
}
