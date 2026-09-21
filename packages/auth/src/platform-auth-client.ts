"use client";

import { createAuthClient } from "better-auth/react";

/**
 * Browser client for the platform console's OWN auth endpoint.
 *
 * No `baseURL`, so it calls `/api/auth` on whatever origin the console is served from — which is
 * what keeps the cookie it receives scoped to the console's host rather than the operator app's.
 * Pointing this at the operator app would silently reunify the two sessions and undo the
 * separation the second instance exists to create.
 */
export const platformAuthClient = createAuthClient();
