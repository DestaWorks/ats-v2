/**
 * Wire shapes of the `/crm/**` endpoints — clients and everything hanging off one: contacts,
 * deals and their blockers, tasks, meetings, notes, the analytics reads, the AI workspace, and
 * the admin side of the client portal.
 *
 * One module for the whole area because these shapes reference each other's conventions rather
 * than each other's fields: every create and edit answers with the single resource it touched,
 * wrapped under its own name, and every removal answers `CrmRemovalResponse`. Declaring those
 * conventions once here is what stops the Next.js route and the NestJS controller from each
 * growing their own version of `{ ok: true, id }`.
 */
import type {
  ClientContactDTO,
  ClientDetailDTO,
  ClientListDTO,
  ClientMeetingDTO,
  ClientProfileDTO,
  ClientTaskDTO,
  DealBlockerDTO,
  DealDTO,
} from "../validation/client";
import type { ClientNoteDTO } from "../validation/client-note";
import type { CompareRowDTO, HealthScoreDTO, RevenueDTO } from "../validation/crm-analytics";
import type { WorkspaceResultDTO } from "../validation/crm-ai-workspace";
import type { AdminPortalContactDTO, GeneratedPortalLinkDTO } from "../validation/portal";

/**
 * What every CRM removal answers: the id that is gone. The rows are soft-deleted, so the caller
 * gets no resource back to render — only enough to drop the one it was showing.
 */
export interface CrmRemovalResponse {
  ok: true;
  id: string;
}

/** A single client profile, wrapped — what both the create and the edit answer with. */
export interface ClientEnvelope {
  client: ClientProfileDTO;
}

/** A single contact, wrapped. */
export interface ClientContactEnvelope {
  contact: ClientContactDTO;
}

/** A single deal, wrapped. */
export interface DealEnvelope {
  deal: DealDTO;
}

/** A single deal blocker, wrapped. */
export interface DealBlockerEnvelope {
  blocker: DealBlockerDTO;
}

/** A single follow-up task, wrapped. */
export interface ClientTaskEnvelope {
  task: ClientTaskDTO;
}

/** A single logged meeting, wrapped. */
export interface ClientMeetingEnvelope {
  meeting: ClientMeetingDTO;
}

/** A single call/note-log entry, wrapped. */
export interface ClientNoteEnvelope {
  note: ClientNoteDTO;
}

/** Response body of `GET /crm/clients`. */
export type GetCrmClientsResponse = ClientListDTO;

/** Response body of `POST /crm/clients` (201). */
export type PostCrmClientResponse = ClientEnvelope;

/** Response body of `GET /crm/clients/:id`. */
export type GetCrmClientResponse = ClientDetailDTO;

/** Response body of `PATCH /crm/clients/:id`. */
export type PatchCrmClientResponse = ClientEnvelope;

/** Response body of `GET /crm/compare`. */
export interface GetCrmCompareResponse {
  clients: CompareRowDTO[];
}

/** Response body of `GET /crm/clients/:id/health`. */
export type GetCrmClientHealthResponse = HealthScoreDTO;

/** Response body of `GET /crm/clients/:id/revenue`. */
export type GetCrmClientRevenueResponse = RevenueDTO;

/** Response body of `POST /crm/clients/:id/ai-workspace`. */
export type PostCrmAiWorkspaceResponse = WorkspaceResultDTO;

/** Response body of `POST /crm/clients/:id/contacts` (201). */
export type PostCrmClientContactResponse = ClientContactEnvelope;

/** Response body of `PATCH /crm/clients/:id/contacts/:contactId`. */
export type PatchCrmClientContactResponse = ClientContactEnvelope;

/** Response body of `DELETE /crm/clients/:id/contacts/:contactId`. */
export type DeleteCrmClientContactResponse = CrmRemovalResponse;

/** Response body of `POST /crm/clients/:id/deals` (201). */
export type PostCrmDealResponse = DealEnvelope;

/** Response body of `PATCH /crm/clients/:id/deals/:dealId`. */
export type PatchCrmDealResponse = DealEnvelope;

/** Response body of `DELETE /crm/clients/:id/deals/:dealId`. */
export type DeleteCrmDealResponse = CrmRemovalResponse;

/** Response body of `POST /crm/clients/:id/deals/:dealId/blockers` (201). */
export type PostCrmDealBlockerResponse = DealBlockerEnvelope;

/** Response body of `PATCH /crm/clients/:id/deals/:dealId/blockers/:blockerId`. */
export type PatchCrmDealBlockerResponse = DealBlockerEnvelope;

/** Response body of `DELETE /crm/clients/:id/deals/:dealId/blockers/:blockerId`. */
export type DeleteCrmDealBlockerResponse = CrmRemovalResponse;

/** Response body of `POST /crm/clients/:id/tasks` (201). */
export type PostCrmClientTaskResponse = ClientTaskEnvelope;

/** Response body of `PATCH /crm/clients/:id/tasks/:taskId`. */
export type PatchCrmClientTaskResponse = ClientTaskEnvelope;

/** Response body of `DELETE /crm/clients/:id/tasks/:taskId`. */
export type DeleteCrmClientTaskResponse = CrmRemovalResponse;

/** Response body of `POST /crm/clients/:id/meetings` (201). */
export type PostCrmClientMeetingResponse = ClientMeetingEnvelope;

/** Response body of `DELETE /crm/clients/:id/meetings/:meetingId`. */
export type DeleteCrmClientMeetingResponse = CrmRemovalResponse;

/** Response body of `GET /crm/clients/:id/notes`. */
export interface GetCrmClientNotesResponse {
  notes: ClientNoteDTO[];
}

/** Response body of `POST /crm/clients/:id/notes` (201). */
export type PostCrmClientNoteResponse = ClientNoteEnvelope;

/** Response body of `GET /crm/clients/:id/portal/contacts`. */
export interface GetCrmPortalContactsResponse {
  contacts: AdminPortalContactDTO[];
}

/**
 * Response body of `POST /crm/clients/:id/portal/contacts/:contactId/tokens` (201) — carries the
 * plaintext token, which is returned exactly once and never readable again.
 */
export type PostCrmPortalTokenResponse = GeneratedPortalLinkDTO;

/** Response body of `POST /crm/clients/:id/portal/tokens/:tokenId/revoke`. */
export type PostCrmPortalTokenRevokeResponse = CrmRemovalResponse;
