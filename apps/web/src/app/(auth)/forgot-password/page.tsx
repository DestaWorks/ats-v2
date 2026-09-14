import { AuthShell } from "../auth-shell";
import { ForgotPasswordForm } from "./forgot-password-form";

/**
 * Dedicated request-a-reset-link screen (2026-08-08) — previously this was a link inline on
 * `/sign-in` that reused the sign-in form's own email field. `activeTab={null}` (no Sign In /
 * Request Access toggle) matches `/reset-password`: switching away mid-flow doesn't make sense.
 */
export default function ForgotPasswordPage() {
  return (
    <AuthShell activeTab={null}>
      <ForgotPasswordForm />
    </AuthShell>
  );
}
