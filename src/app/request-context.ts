import { cookies, headers } from "next/headers";
import { installRequestContext, type RequestContext } from "@/server/auth/request-context";

/**
 * The Next.js adapter for `server/auth`'s `RequestContext` port (SAAS-RESTRUCTURE-PLAN 0.3).
 * This is the one place the app reads `next/headers`; importing this module installs it for
 * the current runtime, so import it for its side effect from every server entry point that
 * isn't reached through another one (`instrumentation.ts`, the root layout).
 */
export const nextRequestContext: RequestContext = {
  headers: async () => headers(),
  cookie: async (name) => (await cookies()).get(name)?.value,
};

installRequestContext(nextRequestContext);
