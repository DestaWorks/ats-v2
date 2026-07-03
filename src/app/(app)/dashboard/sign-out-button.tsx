"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  async function onClick() {
    await signOut();
    router.push("/sign-in");
    router.refresh();
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-black/15 px-3 py-1.5 text-sm font-semibold text-charcoal transition hover:bg-black/5"
    >
      Sign out
    </button>
  );
}
