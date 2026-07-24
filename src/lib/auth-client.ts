import { createAuthClient } from "better-auth/react";

/**
 * Better Auth browser client. Import `signIn` / `signOut` / `useSession` in client
 * components. (The admin client mirror is added with the admin plugin in Wave 5.)
 * `updateUser`/`changePassword` (Wave 5.4, My Profile) hit Better Auth's own built-in endpoints —
 * server-hashed password change, no custom backend route needed.
 */
export const authClient = createAuthClient();

export const { signIn, signOut, useSession, updateUser, changePassword } = authClient;
