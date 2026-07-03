import { createAuthClient } from "better-auth/react";

/**
 * Better Auth browser client. Import `signIn` / `signOut` / `useSession` in client
 * components. (The admin client mirror is added with the admin plugin in Wave 5.)
 */
export const authClient = createAuthClient();

export const { signIn, signOut, useSession } = authClient;
