import "server-only";
import { headers } from "next/headers";
import { auth } from "./auth";
import { AppError } from "@/server/http/app-error";
import { hasCapability, isRole, type Capability, type Role } from "@/lib/constants";

/** The authenticated user as the app cares about it (role is a validated `Role`). */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

/** Read the current session (or null). Never trusts the client for role — reads it from the DB. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const rawRole = (session.user as { role?: string }).role ?? "Associate";
  const role: Role = isRole(rawRole) ? rawRole : "Associate";
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role,
  };
}

/** Require a signed-in user (401 otherwise). */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new AppError("UNAUTHORIZED", "Sign in required");
  return user;
}

/**
 * Require a specific capability (403 otherwise) — the primary authZ guard.
 * "Leadership"/"admin" gates are capabilities, never hardcoded role lists (DECISIONS D3).
 */
export async function requireCapability(capability: Capability): Promise<AuthUser> {
  const user = await requireUser();
  if (!hasCapability(user.role, capability)) {
    throw new AppError("FORBIDDEN", "You don't have permission to do that");
  }
  return user;
}
