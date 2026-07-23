import { redirect } from "next/navigation";
import Link from "next/link";
import { hasCapability } from "@/lib/constants";
import { getCurrentUser } from "@/server/auth/guards";
import { clientService } from "@/server/services/client.service";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { AddClientButton } from "./add-client-modal";

/**
 * CRM — client list (RSC, Wave 4.2 slice 1). Gated `viewCrm` (leadership) — legacy gates the
 * entire CRM view the same way (`index.html:1415`). The `/api/crm/*` routes enforce the same
 * capability, so this is a friendly no-access screen + the real gate, matching `migration/page.tsx`.
 */
export default async function CrmPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  if (!hasCapability(user.role, "viewCrm")) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 sm:p-8">
        <ErrorState
          title="You don't have access"
          message="CRM is limited to leadership roles. Ask an Owner, Director, Manager, or Admin for client account details."
        />
      </div>
    );
  }

  const { clients } = await clientService.list();

  return (
    <div className="flex flex-col gap-5 px-8 py-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">CRM</h1>
          <p className="text-sm text-gray">
            {clients.length} client{clients.length === 1 ? "" : "s"} — account profiles and
            contacts.
          </p>
        </div>
        <AddClientButton size="sm" variant="success" />
      </header>

      {clients.length === 0 ? (
        <EmptyState title="No clients yet" description="Add the first client account above." />
      ) : (
        <Table
          caption="Client accounts"
          columns={["Name", "Priority", "Location", "Primary Contact", "Renewal", "Contacts"]}
        >
          {clients.map((c) => (
            <tr key={c.id} className="hover:bg-black/[0.02]">
              <Td className="font-medium text-charcoal">
                <Link href={`/crm/${c.id}`} className="hover:underline">
                  {c.name}
                </Link>
              </Td>
              <Td>{c.priority ?? "—"}</Td>
              <Td>{c.location ?? "—"}</Td>
              <Td>{c.contact ?? "—"}</Td>
              <Td>{c.renewalDate ? new Date(c.renewalDate).toLocaleDateString() : "—"}</Td>
              <Td>{c.contactCount}</Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
