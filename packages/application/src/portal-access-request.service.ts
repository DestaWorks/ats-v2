import { portalAccessRequestRepository } from "@destaworks/db/repositories/portal-access-request.repository";
import { clientContactRepository } from "@destaworks/db/repositories/client-contact.repository";
import { clientPortalService } from "./client-portal.service";
import { AppError } from "@destaworks/integrations/http/app-error";
import { toIso } from "@destaworks/domain/utils/iso";
import { defined } from "@destaworks/domain/utils/defined";
import type { TenantContext } from "@destaworks/domain/tenant";
import type {
  ApprovePortalRequestInput,
  GeneratedPortalLinkDTO,
  PortalAccessRequestDTO,
  PortalAccessRequestInput,
} from "@destaworks/contracts/validation/portal";

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
    return portalAccessRequestRepository.create(
      defined({
        name: input.name,
        email: input.email,
        requestedClientName: input.requestedClientName,
        note: input.note,
      }),
    );
  },

  async list(): Promise<PortalAccessRequestDTO[]> {
    const rows = await portalAccessRequestRepository.list();
    return rows.map(toDTO);
  },

  /**
   * Flips status to approved (atomically, before any side effect), then links to an existing
   * contact (`input.contactId`) or creates a new one from the request's name/email under
   * `input.clientId`, then generates a portal link.
   */
  async approve(
    id: string,
    input: ApprovePortalRequestInput,
    actor: TenantContext,
  ): Promise<GeneratedPortalLinkDTO> {
    const request = await portalAccessRequestRepository.findById(actor, id);
    if (!request) throw new AppError("NOT_FOUND", "Access request not found");

    const claimed = await portalAccessRequestRepository.claimPending(actor, id, "approved");
    if (claimed !== 1) {
      throw new AppError("CONFLICT", "This request has already been resolved");
    }

    try {
      const contactId = input.contactId
        ? input.contactId
        : (
            await clientContactRepository.create(actor, {
              clientId: input.clientId,
              fullName: request.name,
              email: request.email,
              role: "unknown",
              addedById: actor.user.id,
            })
          ).id;

      return await clientPortalService.generateLink(input.clientId, contactId, actor);
    } catch (err) {
      await portalAccessRequestRepository.revertToPending(actor, id);
      throw err;
    }
  },

  async decline(id: string): Promise<void> {
    const request = await portalAccessRequestRepository.findById(id);
    if (!request) throw new AppError("NOT_FOUND", "Access request not found");
    const claimed = await portalAccessRequestRepository.claimPending(id, "declined");
    if (claimed !== 1) {
      throw new AppError("CONFLICT", "This request has already been resolved");
    }
  },
};
