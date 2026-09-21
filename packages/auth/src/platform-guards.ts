import { cache } from "react";
import { requestContext } from "@destaworks/config/request-context";
import { setLogContext } from "@destaworks/config/logger/request-context";
import { AppError } from "@destaworks/integrations/http/app-error";
import { platformAuth } from "./platform-auth";
import type { AuthUser } from "./guards";

/**
 * The signed-in PLATFORM operator, read from `platformAuth` — never the operator app's instance.
 *
 * The two planes carry different cookies on purpose (`desta-platform.*` vs `desta.*`), so this is
 * the only read that can authenticate the console's own calls. Using `getSignedInIdentity` here
 * would both reject every console request and let an ordinary workspace session reach `/platform/*`.
 */
export const getPlatformIdentity = cache(async (): Promise<AuthUser | null> => {
  const session = await platformAuth.api.getSession({ headers: await requestContext().headers() });
  if (!session) return null;
  setLogContext({ userId: session.user.id });
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image ?? null,
  };
});

/** A signed-in platform operator (401 otherwise). The platform plane's authentication. */
export async function requirePlatformIdentity(): Promise<AuthUser> {
  const identity = await getPlatformIdentity();
  if (!identity) throw new AppError("UNAUTHORIZED", "Sign in required");
  return identity;
}
