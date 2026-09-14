import Link from "next/link";
import { EmptyState } from "@destaworks/ui/empty-state";
import { ErrorState } from "@destaworks/ui/error-state";
import { Table, Td } from "@destaworks/ui/table";
import { listPlatformTenants, readImpersonatedActivity } from "../../../lib/platform-api";

export const metadata = { title: "Support access · Platform Console" };

/**
 * What support DID inside a workspace.
 *
 * There is no "start impersonating" button, and there should not be one: consent is the TENANT'S
 * to give. A workspace opens a time-boxed window from their own settings, and this console can
 * only read the trail of what was done with it. An operator who could open their own window would
 * make the consent decorative.
 *
 * The trail is read per workspace because it lives in that workspace's activity log, which is also
 * where its auditors read it.
 */
export default async function ImpersonationPage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string }>;
}) {
  const { slug } = await searchParams;
  const tenants = await listPlatformTenants();

  if (!tenants.ok) {
    return (
      <section>
        <h1 className="mb-4 text-lg font-semibold text-charcoal">Support access</h1>
        <ErrorState title="Couldn't load the tenant registry" message={tenants.failure.message} />
      </section>
    );
  }

  const activity = slug === undefined ? null : await readImpersonatedActivity(slug);

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-charcoal">Support access</h1>
        <p className="text-sm text-gray">
          A workspace grants a time-boxed support window from its own settings. This console reads
          what was done with it — it cannot open one.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {tenants.data.tenants.map((tenant) => (
          <Link
            key={tenant.id}
            href={`/impersonation?slug=${encodeURIComponent(tenant.slug)}`}
            className={`rounded-full border px-3 py-1 text-sm ${
              tenant.slug === slug
                ? "border-navy bg-navy text-white"
                : "border-black/15 text-charcoal hover:bg-black/[0.03]"
            }`}
          >
            {tenant.name}
          </Link>
        ))}
      </div>

      {activity === null ? (
        <EmptyState
          title="Choose a workspace"
          description="Pick one above to read what support did inside it."
        />
      ) : !activity.ok ? (
        <ErrorState title="Couldn't read the support trail" message={activity.failure.message} />
      ) : activity.data.items.length === 0 ? (
        <EmptyState
          title="Nothing recorded"
          description="No support action has been taken inside this workspace."
        />
      ) : (
        <>
          <Table caption="Support activity" columns={["When", "Action", "Entity", "Actor"]}>
            {activity.data.items.map((entry) => (
              <tr key={entry.id} className="border-t border-black/5">
                <Td className="text-gray">{new Date(entry.at).toLocaleString()}</Td>
                <Td className="font-medium text-charcoal">{entry.action}</Td>
                <Td className="text-charcoal">
                  {entry.entity}
                  <span className="ml-1 font-mono text-xs text-gray">{entry.entityId}</span>
                </Td>
                <Td className="font-mono text-xs text-gray">{entry.actor}</Td>
              </tr>
            ))}
          </Table>
          {activity.data.hasMore ? (
            <p className="text-xs text-gray">
              More entries exist than are shown — this is the most recent page.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
