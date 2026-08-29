import { randomBytes } from "node:crypto";
import {
  PORTAL_TOKEN_TTL_DAYS,
  PORTAL_VISIBLE_STATUS_CODES,
  statusLabel,
} from "@destaworks/domain/constants";
import type { CandidateStatus } from "@destaworks/domain/constants";
import type {
  AdminPortalContactDTO,
  AdminPortalTokenDTO,
  GeneratedPortalLinkDTO,
  PortalCandidateDTO,
  PortalDataDTO,
  PortalRoleDTO,
  PostPortalRoleInput,
} from "@destaworks/contracts/validation/portal";
import { toIso, isoOrNull } from "@destaworks/domain/utils/iso";
import { defined } from "@destaworks/domain/utils/defined";
import type { TenantContext } from "@destaworks/domain/tenant";
import type { PortalContext } from "@destaworks/auth/portal-guards";
import { hashPortalToken } from "@destaworks/auth/portal-guards";
import { writeAudit } from "@destaworks/db/audit";
import { withTransaction } from "@destaworks/db/with-transaction";
import { clientContactRepository } from "@destaworks/db/repositories/client-contact.repository";
import { clientPortalTokenRepository } from "@destaworks/db/repositories/client-portal-token.repository";
import { clientRepository } from "@destaworks/db/repositories/client.repository";
import { candidateRepository } from "@destaworks/db/repositories/candidate.repository";
import {
  openRoleRepository,
  type OpenRoleRow,
} from "@destaworks/db/repositories/open-role.repository";
import { AppError } from "@destaworks/integrations/http/app-error";

/** URL-safe, 256-bit generated portal token. */
function generateRawToken(): string {
  return randomBytes(32).toString("base64url");
}

function toAdminTokenDTO(row: {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}): AdminPortalTokenDTO {
  return {
    id: row.id,
    createdAt: toIso(row.createdAt),
    expiresAt: toIso(row.expiresAt),
    lastUsedAt: isoOrNull(row.lastUsedAt),
    revokedAt: isoOrNull(row.revokedAt),
  };
}

function toAdminContactDTO(
  contact: { id: string; fullName: string; email: string | null; portalEnabled: boolean },
  activeToken: Parameters<typeof toAdminTokenDTO>[0] | null,
): AdminPortalContactDTO {
  return {
    id: contact.id,
    fullName: contact.fullName,
    email: contact.email,
    portalEnabled: contact.portalEnabled,
    activeToken: activeToken ? toAdminTokenDTO(activeToken) : null,
  };
}

function toPortalCandidateDTO(row: {
  id: string;
  name: string;
  credential: string | null;
  licenseState: string | null;
  status: string;
  city: string | null;
  state: string | null;
  yearsExp: number | null;
  employer: string | null;
}): PortalCandidateDTO {
  return {
    id: row.id,
    name: row.name,
    credential: row.credential,
    licenseState: row.licenseState,
    status: statusLabel(row.status as CandidateStatus),
    city: row.city,
    state: row.state,
    yearsExp: row.yearsExp,
    employer: row.employer,
  };
}

function toPortalRoleDTO(row: OpenRoleRow): PortalRoleDTO {
  return {
    id: row.id,
    title: row.title,
    credential: row.credential,
    state: row.state,
    city: row.city,
    setting: row.setting,
    rate: row.rate,
    description: row.description,
    priority: row.priority,
    status: row.status,
    openedAt: toIso(row.openedAt),
  };
}

async function requireContactInClient(clientId: string, contactId: string) {
  const contact = await clientContactRepository.findById(contactId);
  if (!contact || contact.clientId !== clientId || contact.deletedAt) {
    throw new AppError("NOT_FOUND", "Contact not found");
  }
  return contact;
}

/**
 * Client Portal service (Wave 4.3). Every read/write here takes `contactId`/`clientId` resolved
 * by `portal-guards.ts` from the verified cookie — never a client-supplied value (the fix for
 * legacy's IDOR, where `portal_data`/`portal_post_role` trusted a request-body email).
 */
export const clientPortalService = {
  // --- admin management (acting user = internal staff, requireCapability enforced at the route) ---

  async generateLink(
    clientId: string,
    contactId: string,
    actor: TenantContext,
  ): Promise<GeneratedPortalLinkDTO> {
    await requireContactInClient(clientId, contactId);
    const rawToken = generateRawToken();
    const tokenHash = hashPortalToken(rawToken);
    const expiresAt = new Date(Date.now() + PORTAL_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    const { contact, token } = await withTransaction(async (tx) => {
      await clientPortalTokenRepository.revokeAllForContact(contactId, tx);
      const tokenRow = await clientPortalTokenRepository.create(
        { contactId, tokenHash, expiresAt, createdById: actor.user.id },
        tx,
      );
      await clientContactRepository.update(clientId, contactId, { portalEnabled: true }, tx);
      await writeAudit(tx, {
        entity: "client_portal_token",
        entityId: tokenRow.id,
        actor: actor.user.id,
        action: "generate_portal_link",
        after: { clientId, contactId },
      });
      const updatedContact = await clientContactRepository.findById(contactId, tx);
      if (!updatedContact) throw new AppError("NOT_FOUND", "Contact not found");
      return { contact: updatedContact, token: tokenRow };
    });

    return { contact: toAdminContactDTO(contact, token), token: rawToken };
  },

  async revokeLink(clientId: string, tokenId: string, actor: TenantContext): Promise<void> {
    const tokenRow = await clientPortalTokenRepository.findById(tokenId);
    if (!tokenRow || tokenRow.contact.clientId !== clientId) {
      throw new AppError("NOT_FOUND", "Portal link not found");
    }
    await withTransaction(async (tx) => {
      const count = await clientPortalTokenRepository.revoke(tokenId, tx);
      if (count === 0) throw new AppError("NOT_FOUND", "Portal link not found");
      await writeAudit(tx, {
        entity: "client_portal_token",
        entityId: tokenId,
        actor: actor.user.id,
        action: "revoke_portal_link",
        after: { clientId, contactId: tokenRow.contactId },
      });
    });
  },

  async listContactsForClient(clientId: string): Promise<AdminPortalContactDTO[]> {
    const contacts = await clientContactRepository.listForClient(clientId);
    const portalEnabledIds = contacts.filter((c) => c.portalEnabled).map((c) => c.id);
    const activeTokens = await clientPortalTokenRepository.findActiveForContacts(portalEnabledIds);
    const activeByContactId = new Map(activeTokens.map((t) => [t.contactId, t]));
    return contacts.map((c) => toAdminContactDTO(c, activeByContactId.get(c.id) ?? null));
  },

  // --- public portal surface (acting identity = the resolved PortalContext) ---

  async data(ctx: PortalContext): Promise<PortalDataDTO> {
    const [client, candidateRows, roleRows] = await Promise.all([
      clientRepository.findById(ctx.clientId),
      candidateRepository.listCards({
        clientId: ctx.clientId,
        statuses: [...PORTAL_VISIBLE_STATUS_CODES],
      }),
      openRoleRepository.list({ clientId: ctx.clientId }),
    ]);
    if (!client) throw new AppError("NOT_FOUND", "Client not found");

    return {
      client: { name: client.name },
      contact: { fullName: ctx.fullName },
      candidates: candidateRows.map(toPortalCandidateDTO),
      roles: roleRows.filter((r) => r.status !== "Closed").map(toPortalRoleDTO),
    };
  },

  async postRole(ctx: PortalContext, input: PostPortalRoleInput): Promise<{ id: string }> {
    const role = await withTransaction(async (tx) => {
      const row = await openRoleRepository.create(
        {
          clientId: ctx.clientId,
          postedByContactId: ctx.contactId,
          status: "Open",
          ...defined(input),
        },
        tx,
      );
      await writeAudit(tx, {
        entity: "open_role",
        entityId: row.id,
        actor: ctx.contactId,
        action: "portal_post_role",
        after: { clientId: ctx.clientId, title: row.title },
      });
      return row;
    });
    return { id: role.id };
  },

  async logView(ctx: PortalContext, page: string): Promise<void> {
    await withTransaction((tx) =>
      writeAudit(tx, {
        entity: "portal_view",
        entityId: ctx.contactId,
        actor: ctx.contactId,
        action: "view",
        after: { clientId: ctx.clientId, page },
      }),
    );
  },
};
