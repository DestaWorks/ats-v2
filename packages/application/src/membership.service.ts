import { writeAudit } from "@destaworks/db/audit";
import {
  membershipRepository,
  type MembershipRow,
} from "@destaworks/db/tenancy/membership.repository";
import { userRepository } from "@destaworks/db/repositories/user.repository";
import { withTenantTransaction } from "@destaworks/db/with-transaction";
import { withAnnouncedTenant } from "@destaworks/db/tenant-transaction";
import { hasCapability, isRole, ROLES, type Role } from "@destaworks/domain/constants";
import type { TenantContext } from "@destaworks/domain/tenant";
import { toIso } from "@destaworks/domain/utils/iso";
import type { AuthUser } from "@destaworks/auth/guards";
import {
  listTenantChoices,
  resolveTenantContext,
  type TenantChoice,
} from "@destaworks/auth/tenant-context";
import { AppError } from "@destaworks/integrations/http/app-error";
import type {
  AcceptInvitationInput,
  DeleteTenantMemberResponse,
  GetTenantMembersResponse,
  GetTenantsResponse,
  InviteMemberInput,
  PostTenantMemberAcceptResponse,
  PostTenantMemberResponse,
  PostTenantSwitchResponse,
  SwitchTenantInput,
  TenantChoiceDTO,
  TenantMemberDTO,
} from "@destaworks/contracts/validation/tenant";

/**
 * Membership: which people are in a tenant, and which tenant a person is currently acting in
 * (SAAS-RESTRUCTURE-PLAN 6.5).
 *
 * ── Switching is server-authoritative ───────────────────────────────────────────────────────────
 *
 * `switchTenant` does not set anything. It re-runs the ONE resolution path
 * (`resolveTenantContext`) against the tenant the client named and answers with the verified
 * tenant — or throws. The cookie the transport then writes therefore cannot contain a tenant the
 * server has not already agreed to, and even that is not a grant: the cookie is re-verified as a
 * claim on every subsequent request. A client that names a tenant it has no active membership in
 * gets a 403 and no cookie, in that order.
 *
 * ── Capabilities, never role names ─────────────────────────────────────────────────────────────
 *
 * Every gate below reads `hasCapability(ctx.role, …)`, and `ctx.role` comes from the MEMBERSHIP.
 * There is no role name in this file except as a value of the `Role` enum being tested for a
 * capability — `ADMINISTRATIVE_ROLES` is derived from the capability table, not written out, so
 * adding a role that can manage users does not silently exempt it from the last-administrator
 * check below.
 */

/**
 * The roles that can manage a tenant's members, DERIVED from the capability model rather than
 * listed. Used only to count how many such members remain, never to authorize anything.
 */
const ADMINISTRATIVE_ROLES: readonly Role[] = ROLES.filter((role) =>
  hasCapability(role, "manageUsers"),
);

function toChoiceDTO(choice: TenantChoice): TenantChoiceDTO {
  return {
    tenantId: choice.tenantId,
    slug: choice.slug,
    name: choice.name,
    role: choice.role,
    status: choice.status,
  };
}

function roleOf(row: MembershipRow): Role {
  return isRole(row.role) ? row.role : "Associate";
}

function toMemberDTO(row: MembershipRow, name: string, email: string): TenantMemberDTO {
  return {
    membershipId: row.id,
    userId: row.userId,
    name,
    email,
    role: roleOf(row),
    status: row.status,
    createdAt: toIso(row.createdAt),
  };
}

/** The gate on every member-management call. One line, one place, capability-only. */
function requireMemberManagement(ctx: TenantContext): void {
  if (!hasCapability(ctx.role, "manageUsers")) {
    throw new AppError("FORBIDDEN", "You don't have permission to do that");
  }
}

export const membershipService = {
  /** Every workspace the signed-in user may switch into, plus invitations awaiting acceptance. */
  async listForUser(user: AuthUser): Promise<GetTenantsResponse> {
    const choices = await listTenantChoices(user.id);
    return { tenants: choices.map(toChoiceDTO) };
  },

  /**
   * Make a tenant the active one. Verification only — the caller writes the cookie afterwards.
   *
   * The claim is marked `body` so a log line shows the switch apart from an ordinary request that
   * merely carried the cookie, while going through the identical verification.
   */
  async switchTenant(user: AuthUser, input: SwitchTenantInput): Promise<PostTenantSwitchResponse> {
    const resolution = await resolveTenantContext(user, { source: "body", slug: input.tenant });
    if (resolution.outcome !== "resolved") {
      throw new AppError("FORBIDDEN", "You don't have access to that workspace");
    }
    return { tenant: toChoiceDTO(resolution.tenant) };
  },

  /** The active tenant's roster. Behind `manageUsers` — it is the only response that names people. */
  async listMembers(ctx: TenantContext): Promise<GetTenantMembersResponse> {
    requireMemberManagement(ctx);
    const rows = await membershipRepository.listByTenant(ctx.tenantId);
    const ids = rows.map((row) => row.userId);
    const [names, emails] = await Promise.all([
      userRepository.namesByIds(ids),
      userRepository.emailsByIds(ids),
    ]);
    return {
      members: rows.map((row) =>
        toMemberDTO(row, names.get(row.userId) ?? "Unknown", emails.get(row.userId) ?? ""),
      ),
    };
  },

  /**
   * Invite an EXISTING account into the active tenant.
   *
   * It deliberately cannot create the account. `User.email` is globally unique — one human, one
   * login, membership in many tenants — and account creation already has exactly one path
   * (`adminUserService.create`, reached from the admin screen and from an approved access
   * request), which sets `emailVerified`, hashes a password through Better Auth, and returns the
   * generated credential once. A second creation path reached from an invite form would be a
   * weaker copy of that, and it is the copy an attacker would look for. So an invitation attaches
   * a membership to an account that already exists, and says so when it does not.
   *
   * The invited membership is created as `invited`, which grants nothing until it is accepted.
   */
  async invite(ctx: TenantContext, input: InviteMemberInput): Promise<PostTenantMemberResponse> {
    requireMemberManagement(ctx);

    const found = await userRepository.findByEmail(input.email);
    if (found === null) {
      throw new AppError("NOT_FOUND", "No account with that email address");
    }
    const actor = await userRepository.findActorById(found.id);
    if (actor === null) {
      throw new AppError("NOT_FOUND", "No account with that email address");
    }

    const current = await membershipRepository.findByTenantAndUser(ctx.tenantId, found.id);
    if (current !== null && current.status === "active") {
      throw new AppError("CONFLICT", "That account is already a member of this workspace");
    }

    const row = await withTenantTransaction(ctx, async (tx) => {
      const created = await membershipRepository.upsertMembership(
        {
          tenantId: ctx.tenantId,
          userId: found.id,
          role: input.role,
          invitedById: ctx.user.id,
          status: "invited",
        },
        tx,
      );
      await writeAudit(tx, {
        entity: "membership",
        entityId: created.id,
        actor: ctx.user.id,
        action: "invite",
        tenantId: ctx.tenantId,
        after: { membershipId: created.id, userId: created.userId, role: created.role },
      });
      return created;
    });

    return { member: toMemberDTO(row, actor.name, actor.email) };
  },

  /**
   * Accept an invitation. Only the invitee can: the membership is looked up BY the signed-in
   * user's id, so there is no argument through which one person could accept another's.
   *
   * No tenant context is required or available here — an invited membership grants none, which is
   * the property being tested. The acceptance is what creates the access.
   */
  async acceptInvitation(
    user: AuthUser,
    input: AcceptInvitationInput,
  ): Promise<PostTenantMemberAcceptResponse> {
    const row = await membershipRepository.findByUserAndSlug(user.id, input.tenant);
    if (row === null || row.tenant.deletedAt !== null) {
      throw new AppError("NOT_FOUND", "No invitation for that workspace");
    }
    if (row.tenant.status === "suspended") {
      throw new AppError("FORBIDDEN", "You don't have access to that workspace");
    }
    if (row.status !== "invited") {
      throw new AppError("CONFLICT", "That invitation is no longer open");
    }

    // Announced with the membership's own tenant: the audit row below lands in `activity_log`,
    // which is tenant-scoped with a WITH CHECK policy, and an invitation carries no context to
    // announce until the moment it is accepted. Without this the insert is refused under RLS and
    // accepting an invitation fails for every user.
    const accepted = await withAnnouncedTenant(row.tenantId, async (tx) => {
      const updated = await membershipRepository.updateStatus(row.id, "active", tx);
      await writeAudit(tx, {
        entity: "membership",
        entityId: updated.id,
        actor: user.id,
        action: "accept_invite",
        tenantId: updated.tenantId,
        before: { status: row.status },
        after: { status: updated.status },
      });
      return updated;
    });

    return {
      tenant: {
        tenantId: accepted.tenantId,
        slug: accepted.tenant.slug,
        name: accepted.tenant.name,
        role: roleOf(accepted),
        status: "active",
      },
    };
  },

  /**
   * Remove a member. Access ends on their very next request: resolution reads the membership row
   * every time, so there is no session or cached context left holding the old answer.
   *
   * The last administrator cannot be removed. A tenant with no member holding `manageUsers` cannot
   * invite one either, so the tenant would be permanently unadministerable — recoverable only from
   * the platform plane, which is not a place routine mistakes should have to be fixed from.
   */
  async remove(ctx: TenantContext, membershipId: string): Promise<DeleteTenantMemberResponse> {
    requireMemberManagement(ctx);

    const row = await membershipRepository.findByIdInTenant(ctx.tenantId, membershipId);
    if (row === null) throw new AppError("NOT_FOUND", "No such member");
    if (row.status === "removed") throw new AppError("CONFLICT", "That member was already removed");

    if (row.status === "active" && hasCapability(roleOf(row), "manageUsers")) {
      const administrators = await membershipRepository.countActiveByRole(
        ctx.tenantId,
        ADMINISTRATIVE_ROLES,
      );
      if (administrators <= 1) {
        throw new AppError(
          "CONFLICT",
          "A workspace must keep at least one member who can manage it",
        );
      }
    }

    const removed = await withTenantTransaction(ctx, async (tx) => {
      const updated = await membershipRepository.updateStatus(row.id, "removed", tx);
      await writeAudit(tx, {
        entity: "membership",
        entityId: updated.id,
        actor: ctx.user.id,
        action: "remove_member",
        tenantId: ctx.tenantId,
        before: { status: row.status, role: row.role },
        after: { status: updated.status },
      });
      return updated;
    });

    const [names, emails] = await Promise.all([
      userRepository.namesByIds([removed.userId]),
      userRepository.emailsByIds([removed.userId]),
    ]);
    return {
      member: toMemberDTO(
        removed,
        names.get(removed.userId) ?? "Unknown",
        emails.get(removed.userId) ?? "",
      ),
    };
  },
};
