import "server-only";
import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { auth } from "@/server/auth/auth";
import { toIso, isoOrNull } from "@/lib/utils/iso";
import type { Role } from "@/lib/constants";
import type {
  AdminUserDTO,
  AdminUserListDTO,
  BanUserInput,
  CreateUserInput,
  GeneratedPasswordDTO,
} from "@/lib/validation/admin";

/** A URL-safe, 16-char generated password — well above Better Auth's default minimum length. */
function generatePassword(): string {
  return randomBytes(12).toString("base64url");
}

interface BetterAuthUser {
  id: string;
  name: string;
  email: string;
  role?: string | string[] | null;
  banned?: boolean | null;
  banReason?: string | null;
  banExpires?: Date | null;
  createdAt: Date;
}

function toDTO(user: BetterAuthUser): AdminUserDTO {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
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
 * `roles`/`adminRoles` config) — the route itself already gated on `requireCapability` first.
 */
export const adminUserService = {
  async list(): Promise<AdminUserListDTO> {
    const result = await auth.api.listUsers({
      headers: await headers(),
      query: { limit: 500, sortBy: "createdAt", sortDirection: "desc" },
    });
    return { users: result.users.map((u) => toDTO(u)), total: result.total };
  },

  /** Generates + returns a password once when `input.password` is omitted (never persisted in plaintext). */
  async create(input: CreateUserInput): Promise<GeneratedPasswordDTO> {
    const generatedPassword = input.password ? null : generatePassword();
    const result = await auth.api.createUser({
      headers: await headers(),
      body: {
        name: input.name,
        email: input.email,
        role: input.role,
        password: input.password ?? generatedPassword!,
      },
    });
    return { user: toDTO(result.user), generatedPassword };
  },

  async setRole(userId: string, role: Role): Promise<AdminUserDTO> {
    const result = await auth.api.setRole({ headers: await headers(), body: { userId, role } });
    return toDTO(result.user);
  },

  async ban(userId: string, input: BanUserInput): Promise<AdminUserDTO> {
    const result = await auth.api.banUser({
      headers: await headers(),
      body: {
        userId,
        banReason: input.reason ?? undefined,
        banExpiresIn: input.expiresInDays ? input.expiresInDays * 86_400 : undefined,
      },
    });
    return toDTO(result.user);
  },

  async unban(userId: string): Promise<AdminUserDTO> {
    const result = await auth.api.unbanUser({ headers: await headers(), body: { userId } });
    return toDTO(result.user);
  },

  /** Generates + returns a new password once (never persisted in plaintext). */
  async resetPassword(userId: string): Promise<{ generatedPassword: string }> {
    const generatedPassword = generatePassword();
    await auth.api.setUserPassword({
      headers: await headers(),
      body: { userId, newPassword: generatedPassword },
    });
    return { generatedPassword };
  },

  async remove(userId: string): Promise<void> {
    await auth.api.removeUser({ headers: await headers(), body: { userId } });
  },
};
