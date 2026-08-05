import "server-only";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/guards";
import { candidateService } from "@/server/services/candidate.service";
import { cachedClientList } from "@/server/repositories/client.repository";
import { cachedUserList } from "@/server/repositories/user.repository";
import { AppError } from "@/server/http/app-error";

/**
 * Shared RSC loader for the candidate detail — used by BOTH renderings of `/candidates/[id]`:
 * the full page (hard load / deep link) and the route-INTERCEPTED modal (in-app navigation from
 * the board/list). One place owns the guard → composite-read → NOT_FOUND mapping so the two
 * entries can never drift. Returns everything `<CandidateDetail>` needs.
 */
export async function loadCandidateDetail(id: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  // Perf audit 2026-08-04: `clients`/`taggable` only depend on `user` (already resolved above),
  // not on the candidate detail result — kick off all three reads together instead of making two
  // independent queries wait behind the (larger) detail fetch. Each round trip costs real time
  // (cross-region DB), so an avoidable serial wait here was a full extra round trip on every load.
  const detailPromise = candidateService.getCandidateDetail(id, user);
  const clientsPromise = cachedClientList();
  const taggablePromise = cachedUserList(); // @mention targets: id + display name only (no emails client-side)
  // If `detailPromise` throws NOT_FOUND below, these two are never awaited — attach a no-op
  // catch so a rare rejection on that path doesn't surface as an unhandled rejection; the real
  // values/errors on the happy path are still handled by the `Promise.all` further down.
  clientsPromise.catch(() => {});
  taggablePromise.catch(() => {});

  let detail;
  try {
    detail = await detailPromise;
  } catch (err) {
    if (err instanceof AppError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const [clientRows, taggable] = await Promise.all([clientsPromise, taggablePromise]);
  const clients = clientRows.map((c) => ({ id: c.id, name: c.name }));

  return { detail, clients, taggable };
}
