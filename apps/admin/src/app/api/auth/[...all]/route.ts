import { platformAuthHandler } from "@destaworks/auth/platform-auth";

/**
 * The console's OWN auth endpoint — the only route handler in this app.
 *
 * It exists so the console can hold a session independent of the operator app's: same user table,
 * separate cookie. Without it the console could only read whatever identity the operator app
 * happened to have, and signing into a workspace would sign an operator out of here.
 */
export const { GET, POST } = platformAuthHandler;
