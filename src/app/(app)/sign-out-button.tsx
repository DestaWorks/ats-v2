"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

/** Sign-out control. Lives in the app-shell nav (the single owner of sign-out across `(app)`). */
export function SignOutButton() {
  const router = useRouter();
  async function onClick() {
    await signOut();
    router.push("/sign-in");
    router.refresh();
  }
  return (
    <Button type="button" variant="secondary" size="sm" onClick={onClick}>
      Sign out
    </Button>
  );
}
