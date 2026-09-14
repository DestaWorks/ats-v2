import { cookies, headers } from "next/headers";
import { installRequestContext, type RequestContext } from "@destaworks/config/request-context";

/**
 * The Next.js adapter for the framework-free `RequestContext` port (SAAS-RESTRUCTURE-PLAN 0.3).
 * This is the one place the console reads `next/headers`; importing this module installs it for
 * the current runtime, so it is imported for its side effect from the root layout.
 */
export const nextRequestContext: RequestContext = {
  headers: async () => headers(),
  cookie: async (name) => (await cookies()).get(name)?.value,
};

installRequestContext(nextRequestContext);
