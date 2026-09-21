"use client";

import { useState } from "react";
import { platformAuthClient } from "@destaworks/auth/platform-auth-client";

/**
 * End the CONSOLE session.
 *
 * Signs out of this app's own instance, so an operator who is also signed into a workspace stays
 * signed into it — which is the point of the two cookies. Posting to the operator app here would
 * end the wrong session and leave console authority in place.
 */
export function SignOutButton() {
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    try {
      await platformAuthClient.signOut();
    } catch {
      // fall through to the redirect
    }
    window.location.href = "/sign-in";
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
