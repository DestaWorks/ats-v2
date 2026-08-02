import { createAuthClient } from "better-auth/react";

/**
 * Better Auth browser client. Import `signIn` / `signOut` / `useSession` in client
 * components. (The admin client mirror is added with the admin plugin in Wave 5.)
 * `updateUser`/`changePassword` (Wave 5.4, My Profile) and `requestPasswordReset`/`resetPassword`
 * (2026-08-02, forgot-password) all hit Better Auth's own built-in endpoints — server-hashed
 * password change/reset, no custom backend route needed.
 */
export const authClient = createAuthClient();

export const {
  signIn,
  signOut,
  useSession,
  updateUser,
  changePassword,
  requestPasswordReset,
  resetPassword,
} = authClient;
