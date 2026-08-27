import { AuthShell } from "../auth-shell";
import { RequestAccessForm } from "./request-access-form";

export default function RequestAccessPage() {
  return (
    <AuthShell activeTab="request">
      <RequestAccessForm />
    </AuthShell>
  );
}
