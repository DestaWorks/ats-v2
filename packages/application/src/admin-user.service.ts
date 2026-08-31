import { randomBytes } from "node:crypto";
import { auth } from "@destaworks/auth/auth";
import { requestContext } from "@destaworks/config/request-context";
import { toIso, isoOrNull } from "@destaworks/domain/utils/iso";
import { writeAudit } from "@destaworks/db/audit";
import { membershipRepository } from "@destaworks/db/tenancy/membership.repository";
import { withAnnouncedTenant } from "@destaworks/db/tenant-transaction";
import type { TenantContext } from "@destaworks/domain/tenant";
import type { Role } from "@destaworks/domain/constants";
import type {
  AdminUserDTO,
  AdminUserListDTO,
  BanUserInput,
  CreateUserInput,
  GeneratedPasswordDTO,
} from "@destaworks/contracts/validation/admin";

/** A URL-safe, 16-char generated password — well above Better Auth's default minimum length. */
function generatePassword(): string {
  return randomBytes(12).toString("base64url");
}

/**
 * Structural mirror of Better Auth's `UserWithRole` (the admin plugin owns that type, and its
 * optional fields are declared `| undefined`) — so the optionals here carry `| undefined` too,
 * to describe the foreign shape faithfully rather than force every call site to reshape it.
 */
interface BetterAuthUser {
  id: string;
  name: string;
  email: string;
  image?: string | null | undefined;
  role?: string | string[] | null | undefined;
  banned?: boolean | null | undefined;
  banReason?: string | null | undefined;
  banExpires?: Date | null | undefined;
  createdAt: Date;
}

function toDTO(user: BetterAuthUser): AdminUserDTO {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image ?? null,
    role: Array.isArray(user.role) ? (user.role[0] ?? "Associate") : (user.role ?? "Associate"),
    banned: user.banned ?? false,
    banReason: user.banReason ?? null,
    banExpires: isoOrNull(user.banExpires),
    createdAt: toIso(user.createdAt),
  };
}

/**
 * Wraps Better Auth's admin plugin (`auth.api.*`) — that plugin owns storage/hashing for this
 * domain, so there's no repository here. Every call forwards the request's `headers` so Better
 * Auth resolves the acting admin's session for ITS OWN inner permission check (`auth.ts`'s
 * `roles`/`adminRoles` config) — the route itself already gated on `requireCapability` first,
 * against the membership, which is the authoritative check.
 *
 * ── Why `role` is still Better Auth's here, and only here ───────────────────────────────────────
 *
 * `setRole` and `create`'s `role` write `User.role`, and `toDTO` reads it back. That is the last
 * place in the app that touches the column, and it cannot move to `Membership` while these calls
 * go through the plugin: every `auth.api.*` admin endpoint gates itself on `session.user.role`
 * (`plugins/admin/routes.mjs`) and the plugin's own create hook writes `defaultRole` on every
 * account regardless of what we pass. Stop writing it and the whole surface 403s for everyone.
 *
 * It cannot escalate: `requireCapability("manageUsers"|"manageRoles")` runs against the active
 * workspace's membership FIRST, so the plugin's check can only refuse what we already allowed.
 * Retiring it means replacing these endpoints outright — see SAAS-RESTRUCTURE-PLAN 6.4.
 */
export const adminUserService = {
  async list(): Promise<AdminUserListDTO> {
    const result = await auth.api.listUsers({
      headers: await requestContext().headers(),
      query: { limit: 500, sortBy: "createdAt", sortDirection: "desc" },
    });
    return { users: result.users.map((u) => toDTO(u)), total: result.total };
  },

  /**
   * Generates + returns a password once when `input.password` is omitted (never persisted in
   * plaintext). Sets `emailVerified: true` — an admin/access-request-approval creating this
   * account IS this app's trust boundary (invite-only, D3; there's no separate verification
   * email flow). Without this, Better Auth's account-linking (`auth.ts`) requires the LOCAL
   * account's email to already be verified before it will link a same-email Google sign-in —
   * every admin-created account would otherwise permanently fail to link ("account not linked"),
   * blocking the "sign in with either Google or password" flow entirely.
   */
  async create(ctx: TenantContext, input: CreateUserInput): Promise<GeneratedPasswordDTO> {
    const password = input.password ?? generatePassword();
    const generatedPassword = input.password ? null : password;
    const result = await auth.api.createUser({
      headers: await requestContext().headers(),
      body: {
        name: input.name,
        email: input.email,
        role: input.role,
        password,
        data: { emailVerified: true },
      },
    });
    // The account and its membership are one act. Without this the person signs in, resolves to no
    // workspace, and every guarded page answers 401 — an "Add user" that appears to work and does
    // not. Active, not invited: the administrator sets the password and hands it over, so there is
    // nobody left to accept.
    await withAnnouncedTenant(ctx.tenantId, async (tx) => {
      const membership = await membershipRepository.upsertMembership(
        {
          tenantId: ctx.tenantId,
          userId: result.user.id,
          role: input.role,
          invitedById: ctx.user.id,
          status: "active",
        },
        tx,
      );
      await writeAudit(tx, {
        entity: "user",
        entityId: result.user.id,
        actor: ctx.user.id,
        action: "create",
        after: { email: result.user.email, role: input.role },
      });
      await writeAudit(tx, {
        entity: "membership",
        entityId: membership.id,
        actor: ctx.user.id,
        action: "create",
        tenantId: ctx.tenantId,
        after: { userId: result.user.id, role: input.role, status: "active" },
      });
    });
    return { user: toDTO(result.user), generatedPassword };
  },

  async setRole(ctx: TenantContext, userId: string, role: Role): Promise<AdminUserDTO> {
    const result = await auth.api.setRole({
      headers: await requestContext().headers(),
      body: { userId, role },
    });
    await withAnnouncedTenant(ctx.tenantId, (tx) =>
      writeAudit(tx, {
        entity: "user",
        entityId: userId,
        actor: ctx.user.id,
        action: "setRole",
        after: { role },
      }),
    );
    return toDTO(result.user);
  },

  async ban(ctx: TenantContext, userId: string, input: BanUserInput): Promise<AdminUserDTO> {
    const result = await auth.api.banUser({
      headers: await requestContext().headers(),
      body: {
        userId,
        banReason: input.reason ?? undefined,
        banExpiresIn: input.expiresInDays ? input.expiresInDays * 86_400 : undefined,
      },
    });
    await withAnnouncedTenant(ctx.tenantId, (tx) =>
      writeAudit(tx, {
        entity: "user",
        entityId: userId,
        actor: ctx.user.id,
        action: "ban",
        after: { banReason: input.reason ?? null, expiresInDays: input.expiresInDays ?? null },
      }),
    );
    return toDTO(result.user);
  },

  async unban(ctx: TenantContext, userId: string): Promise<AdminUserDTO> {
    const result = await auth.api.unbanUser({
      headers: await requestContext().headers(),
      body: { userId },
    });
    await withAnnouncedTenant(ctx.tenantId, (tx) =>
      writeAudit(tx, { entity: "user", entityId: userId, actor: ctx.user.id, action: "unban" }),
    );
    return toDTO(result.user);
  },

  /** Generates + returns a new password once (never persisted in plaintext — the audit row
   *  records that a reset happened, never the password itself). */
  async resetPassword(ctx: TenantContext, userId: string): Promise<{ generatedPassword: string }> {
    const generatedPassword = generatePassword();
    await auth.api.setUserPassword({
      headers: await requestContext().headers(),
      body: { userId, newPassword: generatedPassword },
    });
    await withAnnouncedTenant(ctx.tenantId, (tx) =>
      writeAudit(tx, {
        entity: "user",
        entityId: userId,
        actor: ctx.user.id,
        action: "resetPassword",
      }),
    );
    return { generatedPassword };
  },

  async remove(ctx: TenantContext, userId: string): Promise<void> {
    await auth.api.removeUser({ headers: await requestContext().headers(), body: { userId } });
    await withAnnouncedTenant(ctx.tenantId, (tx) =>
      writeAudit(tx, { entity: "user", entityId: userId, actor: ctx.user.id, action: "remove" }),
    );
  },
};
