import { addNoteSchema } from "@/lib/validation/candidate";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { noteService } from "@/server/services/note.service";
import type { NoteDTO } from "@/lib/validation/candidate";

/** Wire shape of `POST /api/candidates/:id/notes` — the created note (author from the session). */
export interface PostCandidateNoteResponse {
  note: NoteDTO;
}

/** Wire shape of `GET /api/candidates/:id/notes` — the viewer-scoped notes for one candidate. */
export interface GetCandidateNotesResponse {
  notes: NoteDTO[];
}

/**
 * POST /api/candidates/:id/notes — add a note. Guarded by `requireUser()`. `authorId`/`authorName`
 * come from the SERVER session (never the client body — the legacy took `author` from the client).
 * The body is stored RAW; the XSS defense is at RENDER (escaped React children, never
 * `dangerouslySetInnerHTML`). 201 on add, 401 unauth, 404 if the candidate is missing/soft-deleted,
 * 422 on an empty/oversized body or bad `noteType`.
 */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const input = addNoteSchema.parse(await req.json());
  const note = await noteService.add(id, input, user);
  return json<PostCandidateNoteResponse>({ note }, 201);
});

/**
 * GET /api/candidates/:id/notes — the candidate's notes, SERVER-scoped by `visibleNotes` (never
 * client-filtered — the legacy shipped hidden notes to the browser). Guarded by `requireUser()`.
 */
export const GET = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return json<GetCandidateNotesResponse>({ notes: await noteService.listByCandidate(id, user) });
});
