import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser, getSignedInIdentity, type AuthContext } from "@destaworks/auth/guards";

/**
 * The `(app)` page guard. Use this, not `getVerifiedUser` from `@destaworks/auth/guards`.
 *
 * The layout guards the group, but Next renders a layout and its page CONCURRENTLY — so the
 * layout's redirect does not reliably beat the page's own check, and `getVerifiedUser()` throws
 * rather than redirecting (it asserts an invariant the layout is supposed to have established).
 * When a session resolves to no tenant that invariant is false, and the race surfaced as a blank
 * error page instead of a workspace picker.
 *
 * It lives in `apps/web` because redirecting is a Next concern: `packages/auth` is consumed by a
 * NestJS process too, and must not name a framework.
 */
export async function requirePageUser(): Promise<AuthContext> {
  const user = await getCurrentUser();
  if (user) return user;
  // A session with no resolvable tenant is a choice not yet made, not a failed sign-in.
  redirect((await getSignedInIdentity()) ? "/choose-workspace" : "/sign-in");
}
