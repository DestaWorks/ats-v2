import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/guards";
import { clientRepository } from "@/server/repositories/client.repository";
import { InboundTriage } from "./inbound-triage";

/**
 * Inbound Triage (Wave 2.8, RSC shell) — replaces legacy `inbound_triage`. Server-guards the route
 * (the `(app)` layout guards too — defence in depth) and loads the client list for the target-client
 * select on save; the AI extraction + matching itself is all client-driven POSTs (`inbound-triage.tsx`)
 * so the reviewer can edit before anything is written.
 */
export default async function InboundTriagePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const clientRows = await clientRepository.list();
  const clients = clientRows.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="flex flex-col gap-5 px-8 py-6">
      <header>
        <h1 className="text-2xl font-bold text-navy">Inbound Triage</h1>
        <p className="text-sm text-gray">
          Paste a candidate&apos;s reply — AI extracts their details, checks for an existing match,
          and suggests clients.
        </p>
      </header>

      <InboundTriage clients={clients} />
    </div>
  );
}
