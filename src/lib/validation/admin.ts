/**
 * Admin contract (Wave 5.3) — isomorphic types + zod shared by the `/api/admin/*` routes and
 * client. User management itself is owned by Better Auth's admin plugin (`server/auth/auth.ts`);
 * these schemas validate OUR route inputs before they're forwarded to `auth.api.*`.
 */
import { z } from "zod";
import { ROLES } from "@/lib/constants";

// --- Users ----------------------------------------------------------------

export interface AdminUserDTO {
  id: string;
  name: string;
  email: string;
  role: string;
  banned: boolean;
  banReason: string | null;
  banExpires: string | null; // ISO
  createdAt: string; // ISO
}

export interface AdminUserListDTO {
  users: AdminUserDTO[];
  total: number;
}

/** Password is optional — the service generates + returns one once if omitted (never re-fetchable). */
export const createUserSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(200),
    role: z.enum(ROLES),
    password: z.string().min(8).max(200).optional(),
  })
  .strict();
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const setRoleSchema = z.object({ role: z.enum(ROLES) }).strict();

export const banUserSchema = z
  .object({
    reason: z.string().trim().max(2000).nullish(),
    expiresInDays: z.number().int().min(1).max(3650).nullish(),
  })
  .strict();
export type BanUserInput = z.infer<typeof banUserSchema>;

/** Result of an action that mints a new credential — the plaintext is returned exactly once. */
export interface GeneratedPasswordDTO {
  user: AdminUserDTO;
  generatedPassword: string | null;
}

// --- Access requests --------------------------------------------------------

export interface AccessRequestDTO {
  id: string;
  name: string;
  email: string;
  organization: string | null;
  message: string | null;
  status: string;
  createdAt: string; // ISO
}

/** Approving picks a role — legacy's Admin Panel never had this step (a real improvement). */
export const approveRequestSchema = z.object({ role: z.enum(ROLES) }).strict();
