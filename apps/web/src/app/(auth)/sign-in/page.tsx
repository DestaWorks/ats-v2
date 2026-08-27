import { redirect } from "next/navigation";
import { googleEnabled } from "@destaworks/auth/auth";
import { getCurrentUser } from "@destaworks/auth/guards";
import { AuthShell } from "../auth-shell";
import { SignInForm } from "./sign-in-form";

export default async function SignInPage() {
  // Already signed in → skip the form.
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <AuthShell activeTab="signin">
      <SignInForm googleEnabled={googleEnabled} />
    </AuthShell>
  );
}
