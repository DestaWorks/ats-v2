import "server-only";
import { cache } from "react";
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
  image?: string | null;
}

/**
 * Read the current session (or null). Never trusts the client for role — reads it from the DB.
 *
 * `cache()`-wrapped (perf audit 2026-08-04): every page calls this at least twice per request
 * (once in the root layout, again in the page itself, by design — "an additional guard, not a
 * replacement"), and every gated API route calls it via `requireUser`/`requireCapability`. None
 * of that was memoized, so each of those was a full, separate session-lookup DB round trip.
 * `cache()` de-dupes by request (Next.js's own documented pattern for exactly this function
 * shape — no args, and "who's signed in" can't legitimately change mid-request), scoped
 * automatically per-request by Next.js's request context — never leaks across different users'
 * requests.
 */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const rawRole = (session.user as { role?: string }).role ?? "Associate";
  const role: Role = isRole(rawRole) ? rawRole : "Associate";
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role,
    image: session.user.image ?? null,
  };
});

/** Require a signed-in user (401 otherwise). */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new AppError("UNAUTHORIZED", "Sign in required");
  return user;
}

/** For `(app)` pages/loaders — `layout.tsx` already guards the whole group, so this is a
 *  non-null narrowing, not a second check. Throws if that invariant is ever violated. */
export async function getVerifiedUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("getVerifiedUser() called outside the (app) layout's auth guard");
  }
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
