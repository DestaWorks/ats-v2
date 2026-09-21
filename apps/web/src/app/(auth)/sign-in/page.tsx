import { redirect } from "next/navigation";
import { googleEnabled } from "@destaworks/auth/auth";
import { authTrustedOrigins } from "@destaworks/auth/trusted-origins";
import { getCurrentUser } from "@destaworks/auth/guards";
import { safeReturnTo } from "@destaworks/domain/utils/return-to";
import { AuthShell } from "../auth-shell";
import { SignInForm } from "./sign-in-form";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Where the visitor was trying to reach — the platform console sends them here rather than
  // stranding them in an app they may have no workspace in. Validated, never followed as given.
  const { next } = await searchParams;
  const returnTo = safeReturnTo(next, authTrustedOrigins());

  // Already signed in → skip the form.
  const user = await getCurrentUser();
  if (user) redirect(returnTo ?? "/dashboard");

  return (
    <AuthShell activeTab="signin">
      <SignInForm googleEnabled={googleEnabled} {...(returnTo && { returnTo })} />
    </AuthShell>
  );
}
