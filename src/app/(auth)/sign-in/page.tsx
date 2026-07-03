import { redirect } from "next/navigation";
import { googleEnabled } from "@/server/auth/auth";
import { getCurrentUser } from "@/server/auth/guards";
import { SignInForm } from "./sign-in-form";

export default async function SignInPage() {
  // Already signed in → skip the form.
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <SignInForm googleEnabled={googleEnabled} />
    </main>
  );
}
