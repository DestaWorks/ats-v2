import "server-only";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/guards";
import { candidateService } from "@/server/services/candidate.service";
import { clientRepository } from "@/server/repositories/client.repository";
import { userRepository } from "@/server/repositories/user.repository";
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

  // Neither of these depends on the candidate detail (or on each other) — all 3 fire in one
  // round trip instead of detail-then-clients/taggable.
  let detail, clientRows, taggable;
  try {
    [detail, clientRows, taggable] = await Promise.all([
      candidateService.getCandidateDetail(id, user),
      clientRepository.list(),
      userRepository.list(), // @mention targets: id + display name only (no emails client-side)
    ]);
  } catch (err) {
    if (err instanceof AppError && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  const clients = clientRows.map((c) => ({ id: c.id, name: c.name }));

  return { detail, clients, taggable };
}
