import { addNoteSchema } from "@destaworks/contracts/validation/candidate";
import { requireUser } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { noteService } from "@destaworks/application/note.service";
import type { NoteEnvelope, NoteListEnvelope } from "@destaworks/contracts/validation/envelopes";

/** Wire shape of `POST /api/candidates/:id/notes` — the created note (author from the session). */
export type PostCandidateNoteResponse = NoteEnvelope;

/** Wire shape of `GET /api/candidates/:id/notes` — the viewer-scoped notes for one candidate. */
export type GetCandidateNotesResponse = NoteListEnvelope;

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
  const note = await noteService.add(user, id, input);
  return json<PostCandidateNoteResponse>({ note }, 201);
});

/**
 * GET /api/candidates/:id/notes — the candidate's notes, SERVER-scoped by `visibleNotes` (never
 * client-filtered — the legacy shipped hidden notes to the browser). Guarded by `requireUser()`.
 */
export const GET = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return json<GetCandidateNotesResponse>({ notes: await noteService.listByCandidate(user, id) });
});
