import { redirect } from "next/navigation";
import Link from "next/link";
import { hasCapability } from "@/lib/constants";
import { getCurrentUser } from "@/server/auth/guards";
import { clientRepository } from "@/server/repositories/client.repository";
import { AddCandidateForm } from "./add-candidate-form";

/**
 * Add candidate (RSC, Wave 2.4). Mirrors the pipeline board / detail guard-then-load pattern (the
 * `(app)` segment has no shared layout): `getCurrentUser()` → redirect if unauthed, then load the
 * clients list for the client select and derive the viewer's `viewCredentials` clearance (drives
 * whether the license-number field is offered). The POST route re-enforces both on submit — this is
 * a UI hint only.
 */
export default async function AddCandidatePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const clientRows = await clientRepository.list();
  const clients = clientRows.map((c) => ({ id: c.id, name: c.name }));
  const canEditCredential = hasCapability(user.role, "viewCredentials");

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 p-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Add candidate</h1>
          <p className="text-sm text-gray">Create a new candidate at stage 0 (New Candidate).</p>
        </div>
        <Link
          href="/pipeline"
          className="rounded-md border border-black/15 px-3 py-1.5 text-sm font-semibold text-charcoal transition hover:bg-black/5"
        >
          Back to pipeline
        </Link>
      </header>

      <AddCandidateForm clients={clients} canEditCredential={canEditCredential} />
    </main>
  );
}
