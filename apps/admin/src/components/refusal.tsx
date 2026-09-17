import { headers } from "next/headers";
import { Card } from "@destaworks/ui/card";

/**
 * The console's two dead ends: no session, and a signed-in user who is not a platform admin.
 *
 * Neither offers a way onward into a tenant. The console has no basis for choosing a workspace
 * for someone — a `PlatformContext` names none, and guessing from a membership would be the
 * platform plane borrowing the tenant plane's authority (SAAS-RESTRUCTURE-PLAN 6.8).
 *
 * The operator sign-in address is configuration, so an unconfigured deployment shows the
 * instruction without a link rather than a link that goes nowhere.
 */
/** This console's own absolute URL for the current request, so a deep link survives sign-in. */
async function consoleUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const path = h.get("x-invoke-path") ?? h.get("x-pathname") ?? "/";
  return `${proto}://${host}${path}`;
}

export async function Refusal({ reason }: { reason: "signed-out" | "refused" }) {
  const operatorUrl = process.env["OPERATOR_APP_URL"];
  // Carry where they were going, so signing in returns them HERE rather than to an app this
  // account may have no workspace in. The operator app validates it before following it.
  const signInUrl = operatorUrl
    ? `${operatorUrl}/sign-in?next=${encodeURIComponent(await consoleUrl())}`
    : undefined;
  const signedOut = reason === "signed-out";

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <Card className="w-full max-w-md px-8 py-10 text-center">
        <p className="font-serif text-xs tracking-[0.2em] text-gray uppercase">
          DestaWorks Platform
        </p>
        <h1 className="mt-3 text-lg font-semibold text-charcoal">
          {signedOut ? "Sign in required" : "Not a platform administrator"}
        </h1>
        <p className="mt-2 text-sm text-gray">
          {signedOut
            ? "This console is for platform operators. Sign in to continue."
            : "This account is not on the platform administrator list. Access to the console is granted by deployment configuration, not by any role inside a workspace."}
        </p>
        {signedOut && signInUrl ? (
          <a
            href={signInUrl}
            className="mt-6 inline-flex items-center rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white"
          >
            Go to sign in
          </a>
        ) : null}
      </Card>
    </main>
  );
}
