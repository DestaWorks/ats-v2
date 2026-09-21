import { redirect } from "next/navigation";
import { Card } from "@destaworks/ui/card";
import { getPlatformIdentity } from "@destaworks/auth/platform-guards";
import { PlatformSignInForm } from "./sign-in-form";

/**
 * Sign-in for the platform console.
 *
 * Separate from the operator app's on purpose: an operator needs to hold both identities at once —
 * one to inspect a workspace, one to operate the installation — and a single shared cookie makes
 * that impossible.
 *
 * Signing in here grants nothing by itself. `PLATFORM_ADMIN_USER_IDS` still decides, so a valid
 * account that is not on the list reaches the console's refusal rather than its contents.
 */
export default async function PlatformSignInPage() {
  if (await getPlatformIdentity()) redirect("/tenants");

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <Card className="w-full max-w-sm px-8 py-10 text-center">
        <p className="font-serif text-xs tracking-[0.2em] text-gray uppercase">
          DestaWorks Platform
        </p>
        <h1 className="mt-3 mb-6 text-lg font-semibold text-charcoal">Operator sign in</h1>
        <PlatformSignInForm />
      </Card>
    </main>
  );
}
