"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { platformAuthClient } from "@destaworks/auth/platform-auth-client";

export function PlatformSignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const { error: failure } = await platformAuthClient.signIn.email({ email, password });
    setPending(false);
    if (failure) {
      // Deliberately not distinguishing "no such account" from "wrong password" — this form is in
      // front of every tenant's data, so it must not confirm which operator emails exist.
      setError("Sign in failed");
      return;
    }
    router.push("/tenants");
    router.refresh();
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-left">
        <span className="text-xs font-semibold tracking-wide text-gray uppercase">Email</span>
        <input
          type="email"
          required
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-md border border-black/15 px-3 py-2 text-sm focus:ring-2 focus:ring-navy focus:outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-left">
        <span className="text-xs font-semibold tracking-wide text-gray uppercase">Password</span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-md border border-black/15 px-3 py-2 text-sm focus:ring-2 focus:ring-navy focus:outline-none"
        />
      </label>
      {error ? (
        <p role="alert" className="text-xs font-medium text-red">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
