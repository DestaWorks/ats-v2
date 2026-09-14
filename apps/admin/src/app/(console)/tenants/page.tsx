import Link from "next/link";
import { Badge, type BadgeTone } from "@destaworks/ui/badge";
import { EmptyState } from "@destaworks/ui/empty-state";
import { ErrorState } from "@destaworks/ui/error-state";
import { Table, Td } from "@destaworks/ui/table";
import { listPlatformTenants } from "../../../lib/platform-api";

export const metadata = { title: "Tenants · Platform Console" };

/** `status` is an open string on the wire, so an unrecognised value gets the neutral tone. */
const TONE: Record<string, BadgeTone> = {
  active: "success",
  trial: "navy",
  suspended: "danger",
};

export default async function TenantsPage() {
  const result = await listPlatformTenants();

  if (!result.ok) {
    return (
      <section>
        <h1 className="mb-4 text-lg font-semibold text-charcoal">Tenants</h1>
        <ErrorState title="Couldn't load the tenant registry" message={result.failure.message} />
      </section>
    );
  }

  const { tenants } = result.data;

  return (
    <section>
      <h1 className="mb-4 text-lg font-semibold text-charcoal">Tenants</h1>
      {tenants.length === 0 ? (
        <EmptyState
          title="No tenants"
          description="No workspace exists on this installation yet."
        />
      ) : (
        <Table
          caption="Tenants on this installation"
          columns={["Workspace", "Slug", "Status", "Members"]}
        >
          {tenants.map((tenant) => (
            <tr key={tenant.id} className="border-t border-black/5">
              <Td>
                <Link href={`/tenants/${tenant.slug}`} className="font-medium text-navy">
                  {tenant.name}
                </Link>
              </Td>
              <Td className="text-gray">{tenant.slug}</Td>
              <Td>
                <Badge tone={TONE[tenant.status] ?? "neutral"}>{tenant.status}</Badge>
              </Td>
              <Td className="tabular-nums">{tenant.memberCount}</Td>
            </tr>
          ))}
        </Table>
      )}
    </section>
  );
}
