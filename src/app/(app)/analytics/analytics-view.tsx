"use client";

import { useEffect, useState } from "react";
import type { AnalyticsDTO } from "@/lib/validation/reports";
import { getJson } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, Td } from "@/components/ui/table";
import { Bar } from "../reports/lib/report-tab-shell";
import { StatCard } from "../dashboard/stat-card";

interface Options {
  users: { id: string; name: string }[];
}

const TONE_BAR: Record<"red" | "orange" | "green", string> = {
  red: "bg-red",
  orange: "bg-orange",
  green: "bg-green",
};

/**
 * Analytics (Wave 5.2, legacy `vw="kpi"`) — By-Status/Client/Source breakdowns, Time-to-Fill,
 * Source-of-Hire, and Client Capacity. Simpler one-page layout (no tabs, matches legacy) and a
 * smaller filter bar (associate + date range only, matching legacy's KPI-view filter set).
 */
export function AnalyticsView({ options }: { options: Options }) {
  const [createdById, setCreatedById] = useState("");
  const [addedFrom, setAddedFrom] = useState("");
  const [addedTo, setAddedTo] = useState("");
  const [data, setData] = useState<AnalyticsDTO | null | undefined>(undefined);

  useEffect(() => {
    const params = new URLSearchParams();
    if (createdById) params.set("createdById", createdById);
    if (addedFrom) params.set("addedFrom", addedFrom);
    if (addedTo) params.set("addedTo", addedTo);
    setData(undefined);
    let cancelled = false;
    void getJson<AnalyticsDTO>(`/api/analytics?${params.toString()}`).then((res) => {
      if (!cancelled) setData(res.ok ? res.data : null);
    });
    return () => {
      cancelled = true;
    };
  }, [createdById, addedFrom, addedTo]);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-black/5 bg-white p-4 sm:grid-cols-3">
        <Field label="Associate" htmlFor="an-assoc">
          <Select
            id="an-assoc"
            value={createdById}
            onChange={(e) => setCreatedById(e.target.value)}
          >
            <option value="">All associates</option>
            {options.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Added from" htmlFor="an-from">
          <Input
            id="an-from"
            type="date"
            value={addedFrom}
            onChange={(e) => setAddedFrom(e.target.value)}
          />
        </Field>
        <Field label="Added to" htmlFor="an-to">
          <Input
            id="an-to"
            type="date"
            value={addedTo}
            onChange={(e) => setAddedTo(e.target.value)}
          />
        </Field>
      </div>

      {data === undefined ? <p className="text-sm text-gray">Loading…</p> : null}
      {data === null ? <p className="text-sm text-red">Couldn&apos;t load analytics.</p> : null}

      {data ? (
        <div className="flex flex-col gap-5">
          <section className="grid grid-cols-3 gap-3">
            <StatCard label="Total" value={data.total} />
            <StatCard label="Avg Time to Fill" value={data.timeToFill.avgDays ?? 0} />
            <StatCard label="Median Time to Fill" value={data.timeToFill.medianDays ?? 0} />
          </section>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card as="section" className="flex flex-col gap-2 p-5">
              <h3 className="text-sm font-bold tracking-wide text-navy uppercase">By Status</h3>
              {data.byStatus.map((s) => (
                <div key={s.status} className="flex items-center gap-2 text-xs">
                  <span className="w-28 shrink-0 truncate">{s.label}</span>
                  <Bar pct={s.pct} />
                  <span className="w-10 shrink-0 text-right tabular-nums">{s.count}</span>
                </div>
              ))}
            </Card>
            <Card as="section" className="flex flex-col gap-2 p-5">
              <h3 className="text-sm font-bold tracking-wide text-navy uppercase">By Client</h3>
              {data.byClient.map((c) => (
                <div key={c.clientName} className="flex items-center gap-2 text-xs">
                  <span className="w-28 shrink-0 truncate">{c.clientName}</span>
                  <Bar pct={c.pct} className="bg-teal" />
                  <span className="w-10 shrink-0 text-right tabular-nums">{c.count}</span>
                </div>
              ))}
            </Card>
            <Card as="section" className="flex flex-col gap-2 p-5">
              <h3 className="text-sm font-bold tracking-wide text-navy uppercase">By Source</h3>
              {data.bySource.map((s) => (
                <div key={s.source} className="flex items-center gap-2 text-xs">
                  <span className="w-28 shrink-0 truncate">{s.source}</span>
                  <Bar pct={s.pct} className="bg-purple" />
                  <span className="w-10 shrink-0 text-right tabular-nums">{s.count}</span>
                </div>
              ))}
            </Card>
          </div>

          <section>
            <h3 className="mb-2 text-sm font-bold tracking-wide text-navy uppercase">
              Source of Hire
            </h3>
            <Table caption="Source of hire" columns={["Source", "Total", "Placed", "Conv. %"]}>
              {data.sourceOfHire.map((s) => (
                <tr key={s.source}>
                  <Td className="font-medium">{s.source}</Td>
                  <Td className="tabular-nums">{s.total}</Td>
                  <Td className="tabular-nums">{s.placed}</Td>
                  <Td className="tabular-nums">
                    {s.conversionPct !== null ? `${Math.round(s.conversionPct)}%` : "—"}
                  </Td>
                </tr>
              ))}
            </Table>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-bold tracking-wide text-navy uppercase">
              Client Capacity
            </h3>
            <div className="flex flex-col gap-2 rounded-xl border border-black/5 bg-white p-4">
              {data.clientCapacity.length === 0 ? (
                <p className="text-sm text-gray italic">No client has a capacity set yet.</p>
              ) : (
                data.clientCapacity.map((c) => (
                  <div key={c.clientId} className="flex items-center gap-3 text-sm">
                    <span className="w-40 shrink-0 truncate">{c.clientName}</span>
                    <Bar pct={c.pct} className={TONE_BAR[c.tone]} />
                    <span className="w-24 shrink-0 text-right tabular-nums text-gray">
                      {c.placed}/{c.capacity} ({c.pct}%)
                    </span>
                    {c.approachingCapacity ? (
                      <span className={cn("text-xs font-semibold text-red")}>
                        ⚠ Approaching capacity
                      </span>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
