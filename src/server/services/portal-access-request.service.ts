import "server-only";
import { portalAccessRequestRepository } from "@/server/repositories/portal-access-request.repository";
import { clientContactRepository } from "@/server/repositories/client-contact.repository";
import { clientPortalService } from "@/server/services/client-portal.service";
import { AppError } from "@/server/http/app-error";
import { toIso } from "@/lib/utils/iso";
import type { AuthUser } from "@/server/auth/guards";
import type {
  ApprovePortalRequestInput,
  GeneratedPortalLinkDTO,
  PortalAccessRequestDTO,
  PortalAccessRequestInput,
} from "@/lib/validation/portal";

function toDTO(row: {
  id: string;
  name: string;
  email: string;
  requestedClientName: string;
  note: string | null;
  status: string;
  createdAt: Date;
}): PortalAccessRequestDTO {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    requestedClientName: row.requestedClientName,
    note: row.note,
    status: row.status,
    createdAt: toIso(row.createdAt),
  };
}

/**
 * Portal-access-request business logic (Wave 4.3). Deliberately separate from
 * `access-request.service.ts` — approving here grants a `ClientContact` a portal token, never one
 * of the 6 internal RBAC roles (conflating the two would be a real bug, not just a naming clash).
 */
export const portalAccessRequestService = {
  submit(input: PortalAccessRequestInput) {
    return portalAccessRequestRepository.create({
      name: input.name,
      email: input.email,
      requestedClientName: input.requestedClientName,
      note: input.note,
    });
  },

  async list(): Promise<PortalAccessRequestDTO[]> {
    const rows = await portalAccessRequestRepository.list();
    return rows.map(toDTO);
  },

  /**
   * Links to an existing contact (`input.contactId`) or creates a new one from the request's
   * name/email under `input.clientId`, THEN generates a portal link and flips status to approved.
   */
  async approve(
    id: string,
    input: ApprovePortalRequestInput,
    actor: AuthUser,
  ): Promise<GeneratedPortalLinkDTO> {
    const request = await portalAccessRequestRepository.findById(id);
    if (!request) throw new AppError("NOT_FOUND", "Access request not found");
    if (request.status !== "pending") {
      throw new AppError("CONFLICT", "This request has already been resolved");
    }

    const contactId = input.contactId
      ? input.contactId
      : (
          await clientContactRepository.create({
            clientId: input.clientId,
            fullName: request.name,
            email: request.email,
            role: "unknown",
            addedById: actor.id,
          })
        ).id;

    const result = await clientPortalService.generateLink(input.clientId, contactId, actor);
    await portalAccessRequestRepository.updateStatus(id, "approved");
    return result;
  },

  async decline(id: string): Promise<void> {
    const request = await portalAccessRequestRepository.findById(id);
    if (!request) throw new AppError("NOT_FOUND", "Access request not found");
    if (request.status !== "pending") {
      throw new AppError("CONFLICT", "This request has already been resolved");
    }
    await portalAccessRequestRepository.updateStatus(id, "declined");
  },
};
