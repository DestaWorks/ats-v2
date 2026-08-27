import { Suspense } from "react";
import { RequestAccessForm } from "./request-access-form";

export default function PortalRequestAccessPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <Suspense fallback={null}>
        <RequestAccessForm />
      </Suspense>
    </main>
  );
}
