"use client";

import { Card } from "@destaworks/ui/card";
import { EmptyState } from "@destaworks/ui/empty-state";
import { Table, Td } from "@destaworks/ui/table";
import { ReportTabShell } from "./lib/report-tab-shell";
import { buildReportQuery, useReportFetch, type ReportFilterState } from "./lib/use-report-fetch";
import type { ComplianceDTO as GetReportsComplianceResponse } from "@destaworks/contracts/validation/reports";

export function ComplianceTab({ filters }: { filters: ReportFilterState }) {
  const data = useReportFetch<GetReportsComplianceResponse>(
    "/api/reports/compliance",
    buildReportQuery(filters),
  );

  return (
    <ReportTabShell data={data}>
      {(d) => (
        <div className="flex flex-col gap-5">
          <Card as="section" className="flex flex-wrap gap-4 p-5">
            {d.byLicenseStatus.map((s) => (
              <div key={s.licenseStatus} className="rounded-lg bg-black/[0.03] px-3 py-2">
                <p className="text-[10px] font-bold tracking-wide text-gray uppercase">
                  {s.licenseStatus}
                </p>
                <p className="font-serif text-xl font-bold text-charcoal">{s.count}</p>
              </div>
            ))}
          </Card>

          <section>
            <h3 className="mb-2 text-sm font-bold tracking-wide text-navy uppercase">
              Requiring Action
            </h3>
            {d.requiringAction.length === 0 ? (
              <EmptyState
                title="Nothing requires action"
                description="Every candidate is compliant."
              />
            ) : (
              <Table
                caption="Requiring action"
                columns={["Name", "Client", "License Status", "Reasons"]}
              >
                {d.requiringAction.map((r) => (
                  <tr key={r.id}>
                    <Td className="font-medium">{r.name}</Td>
                    <Td>{r.clientName ?? "—"}</Td>
                    <Td>{r.licenseStatus}</Td>
                    <Td>{r.reasons.join("; ")}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </section>
        </div>
      )}
    </ReportTabShell>
  );
}
