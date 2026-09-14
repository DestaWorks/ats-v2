import Link from "next/link";
import { UpsellState } from "@destaworks/ui/upsell-state";
import { hasCapability, hasModule } from "@destaworks/domain/constants";
import { requirePageUser } from "@/lib/page-user";
import type { GetCrmClientsResponse } from "@destaworks/contracts/http/crm";
import { apiGet } from "@/lib/api/server";
import { ErrorState } from "@destaworks/ui/error-state";
import { EmptyState } from "@destaworks/ui/empty-state";
import { Table, Td } from "@destaworks/ui/table";
import { AddClientButton } from "./add-client-modal";

/**
 * CRM — client list (RSC, Wave 4.2 slice 1). Gated `viewCrm` (leadership) — legacy gates the
 * entire CRM view the same way (`index.html:1415`). The `/api/crm/*` routes enforce the same
 * capability, so this is a friendly no-access screen + the real gate, matching `migration/page.tsx`.
 */
export default async function CrmPage() {
  const user = await requirePageUser();

  if (!hasModule(user.modules, "discovery")) {
    return (
      <div className="flex flex-col gap-4 px-8 py-6">
        <UpsellState feature="CRM" />
      </div>
    );
  }

  if (!hasCapability(user, "viewCrm")) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 sm:p-8">
        <ErrorState
          title="You don't have access"
          message="CRM is limited to roles with client-account access. Ask a workspace administrator."
        />
      </div>
    );
  }

  const { clients } = await apiGet<GetCrmClientsResponse>("/crm/clients");

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
        <div className="flex items-center gap-2">
          <Link href="/crm/compare" className="text-sm font-semibold text-navy hover:underline">
            Compare clients →
          </Link>
          <AddClientButton size="sm" variant="success" />
        </div>
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
