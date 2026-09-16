"use client";

import { useState } from "react";

/**
 * End the session from the console.
 *
 * Better Auth lives in the operator app, not here, so this posts to ITS sign-out endpoint rather
 * than clearing a cookie locally: expiring the cookie would log this browser out while leaving the
 * session row valid until it aged out, which is not what a sign-out on the plane that reads every
 * tenant should mean. The operator origin must therefore be in `AUTH_TRUSTED_ORIGINS`.
 *
 * The redirect happens whatever the response was. A failed revoke still ends the session locally,
 * and leaving an operator sitting on a console that looks signed in would be the worse outcome.
 */
export function SignOutButton({ operatorUrl }: { operatorUrl: string }) {
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    try {
      await fetch(`${operatorUrl}/api/auth/sign-out`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        // Better Auth parses the body even though it needs nothing from it; declaring JSON and
        // sending none is a 400, and the session survives a sign-out that looked like it worked.
        body: "{}",
      });
    } catch {
      // fall through to the redirect
    }
    window.location.href = `${operatorUrl}/sign-in`;
  }

  return (
    <button
      type="button"
      onClick={() => void signOut()}
      disabled={pending}
      className="rounded-md border border-black/10 px-2.5 py-1 text-xs font-semibold text-navy hover:bg-black/[0.03] disabled:opacity-60"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
