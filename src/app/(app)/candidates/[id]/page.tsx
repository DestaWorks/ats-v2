import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/guards";
import { candidateService } from "@/server/services/candidate.service";
import { clientRepository } from "@/server/repositories/client.repository";
import { AppError } from "@/server/http/app-error";
import { CandidateDetail } from "./candidate-detail";

/**
 * Candidate detail (RSC). Mirrors the pipeline board's guard-then-read pattern (the `(app)` segment
 * has no shared layout): `getCurrentUser()` → redirect if unauthed, then load the composite
 * `CandidateDetailDTO` server-side via `candidateService.getCandidateDetail` (a direct call, no
 * self-fetch). A NOT_FOUND (missing / soft-deleted) maps to `notFound()`. The viewer's capabilities
 * become UI hints for the client component — the server routes re-enforce them on every mutation.
 */
export default async function CandidateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const { id } = await params;

  let detail;
  try {
    detail = await candidateService.getCandidateDetail(id, user);
  } catch (err) {
    if (err instanceof AppError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const clientRows = await clientRepository.list();
  const clients = clientRows.map((c) => ({ id: c.id, name: c.name }));

  return (
    <CandidateDetail
      initial={detail}
      clients={clients}
      canEditCredential={detail.canVerifyCredentials}
    />
  );
}
