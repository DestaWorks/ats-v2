import type { TenantContext } from "@destaworks/domain/tenant";
import type { LookupOptionsDTO } from "@destaworks/contracts/validation/lookups";
import { clientRepository } from "@destaworks/db/repositories/client.repository";
import { membershipRepository } from "@destaworks/db/tenancy/membership.repository";
import { userRepository } from "@destaworks/db/repositories/user.repository";

/**
 * Filter-dropdown options for the active workspace: id and display name, nothing else.
 *
 * Replaces `request-cache`'s `cachedClientList`/`cachedUserList`, which nine server-rendered pages
 * called through `systemContextFor(tenantId)` — a system context that bypasses every capability
 * check — and which listed `User` GLOBALLY, naming people from other workspaces. Behind the API
 * the read is scoped by the caller's own context, restricted to this tenant's members, and
 * narrowed to id + name. That is strictly tighter than what the in-process path served, so no
 * dropdown loses an option it had.
 *
 * Deliberately NOT `membershipService.listMembers`, which is gated `manageUsers` because it also
 * returns emails and roles. A select needs a name; it does not need the roster.
 */
export const lookupService = {
  async filterOptions(ctx: TenantContext): Promise<LookupOptionsDTO> {
    const [clients, memberships] = await Promise.all([
      clientRepository.list(ctx),
      membershipRepository.listByTenant(ctx.tenantId),
    ]);
    const names = await userRepository.namesByIds(memberships.map((m) => m.userId));
    return {
      clients: clients.map((c) => ({ id: c.id, name: c.name })),
      users: memberships.map((m) => ({ id: m.userId, name: names.get(m.userId) ?? "Unknown" })),
    };
  },
};
