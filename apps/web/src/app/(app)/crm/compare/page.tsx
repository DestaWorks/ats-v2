import Link from "next/link";
import { hasCapability } from "@destaworks/domain/constants";
import type { ClientHealthTier } from "@destaworks/domain/rules/client-health";
import { requirePageUser } from "@/lib/page-user";
import type { GetCrmCompareResponse } from "@destaworks/contracts/http/crm";
import { apiGet } from "@/lib/api/server";
import { Badge, type BadgeTone } from "@destaworks/ui/badge";
import { EmptyState } from "@destaworks/ui/empty-state";
import { ErrorState } from "@destaworks/ui/error-state";
import { Table, Td } from "@destaworks/ui/table";

const TIER_TONE: Record<ClientHealthTier, BadgeTone> = {
  Healthy: "success",
  "Needs Attention": "amber",
  "At Risk": "danger",
};

/**
 * Compare (Wave 4.2 flex, legacy `index.html:7330-7354`) — a cross-client table. Legacy computed
 * its OWN third, independently-drifted "Quick Health" formula here (on top of the Overview tab's
 * health score AND a separate Churn-Risk %) — fixed: this reads the SAME `crmAnalyticsService`
 * health score every client detail page shows, never a cheaper re-approximation.
 */
export default async function ComparePage() {
  const user = await requirePageUser();

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

  const { clients: rows } = await apiGet<GetCrmCompareResponse>("/crm/compare");

  return (
    <div className="flex flex-col gap-5 px-8 py-6">
      <Link href="/crm" className="text-sm font-semibold text-navy hover:underline">
        ← Back to CRM
      </Link>
      <header>
        <h1 className="text-2xl font-bold text-navy">Compare Clients</h1>
        <p className="text-sm text-gray">
          Pipeline, conversion, health, and last contact — side by side.
        </p>
      </header>

      {rows.length === 0 ? (
        <EmptyState title="No clients yet" description="Add a client account first." />
      ) : (
        <Table
          caption="Client comparison"
          columns={[
            "Client",
            "Priority",
            "Cadence",
            "Pipeline",
            "Placed",
            "Active",
            "Conv. %",
            "Health",
            "Last Contact",
          ]}
        >
          {rows.map((r) => (
            <tr key={r.clientId} className="hover:bg-black/[0.02]">
              <Td className="font-medium text-charcoal">
                <Link href={`/crm/${r.clientId}`} className="hover:underline">
                  {r.clientName}
                </Link>
              </Td>
              <Td>{r.priority ?? "—"}</Td>
              <Td>{r.cadence ?? "—"}</Td>
              <Td className="tabular-nums">{r.pipelineCount}</Td>
              <Td className="tabular-nums">{r.placedCount}</Td>
              <Td className="tabular-nums">{r.activeCount}</Td>
              <Td className="tabular-nums">
                {r.conversionPct !== null ? `${r.conversionPct}%` : "—"}
              </Td>
              <Td>
                <div className="flex items-center gap-1.5">
                  <span className="tabular-nums">{r.healthScore}</span>
                  <Badge tone={TIER_TONE[r.healthTier]} size="sm">
                    {r.healthTier}
                  </Badge>
                </div>
              </Td>
              <Td>
                {r.lastContactDaysAgo === null
                  ? "Never"
                  : `${r.lastContactDaysAgo} day${r.lastContactDaysAgo === 1 ? "" : "s"} ago`}
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
