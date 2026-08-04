"use client";

import type { ClientCapacityDTO } from "@/lib/validation/reports";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils/cn";
import { Bar, ReportTabShell } from "./lib/report-tab-shell";
import { useReportFetch } from "./lib/use-report-fetch";

const TONE_BAR: Record<"red" | "orange" | "green", string> = {
  red: "bg-red",
  orange: "bg-orange",
  green: "bg-green",
};

/**
 * Client Capacity — folded from the standalone Analytics page 2026-08-03. Unfiltered/all-time
 * (matches legacy's own scope for this widget), so — like Trends — this tab ignores the page's
 * filter bar.
 */
export function ClientCapacityTab() {
  const data = useReportFetch<ClientCapacityDTO>("/api/reports/client-capacity", "");

  return (
    <ReportTabShell data={data}>
      {(d) =>
        d.clients.length === 0 ? (
          <EmptyState
            title="No client has a capacity set yet"
            description="Set a capacity on a client in CRM to track it here."
          />
        ) : (
          <Card as="section" className="flex flex-col gap-2 p-5">
            {d.clients.map((c) => (
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
            ))}
          </Card>
        )
      }
    </ReportTabShell>
  );
}
