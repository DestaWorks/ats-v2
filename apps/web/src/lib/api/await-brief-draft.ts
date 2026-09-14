import { getJson } from "@/lib/api/client";

/**
 * Wait for a brief-generation JOB to leave its draft behind.
 *
 * Phase 5 moved generation off the request path, so the generate endpoints answer 202 with a job
 * id and the answer arrives later. Until the job runner exposes a status endpoint, the completion
 * signal is the draft itself: the GET for that period returns `draft`/`draftAt`, and a `draftAt`
 * different from the one held before enqueuing means this run finished.
 *
 * Comparing against the PREVIOUS `draftAt` rather than "is there a draft" is what makes
 * regenerating work — a stale draft from an earlier run would otherwise satisfy the wait instantly.
 */
const POLL_INTERVAL_MS = 2_500;

/** Slightly over the job's own 180s ceiling, so a job that fails late is reported as failed. */
const POLL_TIMEOUT_MS = 200_000;

interface DraftCarrier<TDraft> {
  draft: TDraft | null;
  draftAt: string | null;
}

/** Resolves with the new draft, or `null` if it did not arrive before the timeout. */
export async function awaitBriefDraft<TDraft>(
  url: string,
  previousDraftAt: string | null,
): Promise<TDraft | null> {
  const giveUpAt = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < giveUpAt) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const res = await getJson<DraftCarrier<TDraft> | null>(url);
    const body = res.ok ? res.data : null;
    if (body && body.draft !== null && body.draftAt !== previousDraftAt) return body.draft;
  }
  return null;
}
