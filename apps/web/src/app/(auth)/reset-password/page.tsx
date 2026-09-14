import { Suspense } from "react";
import { AuthShell } from "../auth-shell";
import { ResetPasswordForm } from "./reset-password-form";

/**
 * Landing point for the emailed reset link (2026-08-02). Better Auth's own
 * `/api/auth/reset-password/:token` callback route validates the token BEFORE ever reaching here
 * and redirects to this page with either `?token=<verified>` or `?error=INVALID_TOKEN` — this page
 * never sees a token it hasn't already had checked server-side.
 *
 * `Suspense` is required here (unlike `/sign-in`): that page's server component calls
 * `getCurrentUser()`, which forces dynamic rendering on its own; this page has no server data
 * fetch, so Next tries to statically prerender it — and `ResetPasswordForm`'s `useSearchParams()`
 * needs a Suspense boundary to opt out of that (confirmed via `next build`, not guessed).
 */
export default function ResetPasswordPage() {
  return (
    <AuthShell activeTab={null}>
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
