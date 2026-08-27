"use client";

import { useState } from "react";
import Link from "next/link";
import type { CoverageGapRowDTO } from "@/lib/validation/discover";
import type { GetDiscoverCoverageGapSupplyResponse } from "@/app/api/discover/coverage-gaps/supply/route";
import { taxonomyForCredential } from "@/lib/constants";
import { getJson } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, Td } from "@/components/ui/table";

/** Per-row lazy-loaded NPPES supply state — keyed by `credential::state`, component-local (no
 *  persistence/cache — legacy's 7-day cache is a client-perf optimization not worth replicating
 *  for a first cut). */
type SupplyState =
  { status: "idle" } | { status: "loading" } | { status: "loaded"; supply: number };

function rowKey(row: CoverageGapRowDTO) {
  return `${row.credential}::${row.state}`;
}

/**
 * Coverage-gap widget (Wave 5.5 backlog, legacy Drop 68 "Coverage Gaps") — open-role demand vs.
 * sourced/pipeline supply, grouped by (credential, state). NPPES supply per combo is fetched
 * on-demand ("Check NPPES supply" button), not on page load, to avoid an NPPES call per combo.
 */
export function CoverageGaps({ rows }: { rows: CoverageGapRowDTO[] }) {
  const [open, setOpen] = useState(false);
  const [supply, setSupply] = useState<Record<string, SupplyState>>({});

  async function checkSupply(row: CoverageGapRowDTO) {
    const k = rowKey(row);
    setSupply((s) => ({ ...s, [k]: { status: "loading" } }));
    const res = await getJson<GetDiscoverCoverageGapSupplyResponse>(
      `/api/discover/coverage-gaps/supply?credential=${encodeURIComponent(row.credential)}&state=${encodeURIComponent(row.state)}`,
    );
    setSupply((s) => ({
      ...s,
      [k]: res.ok ? { status: "loaded", supply: res.data.supply } : { status: "idle" },
    }));
  }

  if (rows.length === 0) return null;

  return (
    <Card className="flex flex-col gap-2 p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center justify-between rounded text-left text-sm font-bold text-navy hover:underline focus-visible:ring-2 focus-visible:ring-navy focus-visible:outline-none"
      >
        <span>Coverage Gaps ({rows.length} combos with open demand)</span>
        <span className="text-gray">{open ? "▲ Hide" : "▼ Show"}</span>
      </button>
      {open ? (
        <Table
          caption="Open-role demand vs. sourced/pipeline supply, by credential and state"
          columns={[
            "Combo",
            "Roles",
            "In Sourcing",
            "In Pipeline",
            "NPPES Supply",
            "Untapped",
            "Action",
          ]}
        >
          {rows.map((row) => {
            const k = rowKey(row);
            const s = supply[k] ?? { status: "idle" };
            const taxonomyOpt = taxonomyForCredential(row.credential);
            const gap =
              s.status === "loaded"
                ? Math.max(0, s.supply - row.poolCount - row.pipelineCount)
                : null;
            return (
              <tr key={k} className="border-t border-black/5">
                <Td>
                  {row.credential} · {row.state}
                </Td>
                <Td>{row.roleCount}</Td>
                <Td>{row.poolCount}</Td>
                <Td>{row.pipelineCount}</Td>
                <Td>
                  {s.status === "loaded" ? (
                    s.supply
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      loading={s.status === "loading"}
                      onClick={() => void checkSupply(row)}
                    >
                      Check NPPES supply →
                    </Button>
                  )}
                </Td>
                <Td>{gap ?? "—"}</Td>
                <Td>
                  {taxonomyOpt ? (
                    <Link
                      href={`/discover?taxonomy=${encodeURIComponent(taxonomyOpt.value)}&state=${encodeURIComponent(row.state)}`}
                      className="text-sm font-semibold text-navy hover:underline"
                    >
                      Search NPPES →
                    </Link>
                  ) : (
                    <span className="text-gray">—</span>
                  )}
                </Td>
              </tr>
            );
          })}
        </Table>
      ) : null}
    </Card>
  );
}
