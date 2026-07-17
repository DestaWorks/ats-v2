import type { CoverageMatrixDTO } from "@/lib/validation/credentials";
import { Table, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";

/** Cell intensity — 4 tiers, matching legacy's exact thresholds (`legacy/index.html:3131-3136`). */
function cellStyle(total: number, needed: boolean): { bg: string; text: string } {
  if (total === 0 && needed) return { bg: "#FFEBEE", text: "#B71C1C" }; // GAP
  if (total >= 3) return { bg: "#1B5E20", text: "#fff" };
  if (total >= 2) return { bg: "#43A047", text: "#fff" };
  if (total === 1) return { bg: "#A5D6A7", text: "#1B5E20" };
  return { bg: "transparent", text: "inherit" };
}

export function CoverageMatrix({ matrix }: { matrix: CoverageMatrixDTO }) {
  const { states, credentials, cells } = matrix;

  if (credentials.length === 0 || states.length === 0) {
    return (
      <EmptyState
        title="No coverage data yet"
        description="The matrix populates once candidates have a credential and license state on file."
      />
    );
  }

  const byKey = new Map(cells.map((c) => [`${c.credential}::${c.state}`, c]));

  return (
    <div className="flex flex-col gap-2">
      <Table
        caption="Credential by state coverage matrix"
        columns={["Credential", ...states, "Total"]}
      >
        {credentials.map((credential) => {
          const rowCells = states.map((state) => byKey.get(`${credential}::${state}`));
          const rowTotal = rowCells.reduce((sum, c) => sum + (c?.total ?? 0), 0);
          if (rowTotal === 0 && !rowCells.some((c) => c?.needed)) return null;
          return (
            <tr key={credential}>
              <Td className="font-medium text-charcoal">{credential}</Td>
              {rowCells.map((cell, i) => {
                const total = cell?.total ?? 0;
                const needed = cell?.needed ?? false;
                const { bg, text } = cellStyle(total, needed);
                return (
                  <Td
                    key={states[i]}
                    className="text-center"
                    style={{ background: bg, color: text }}
                  >
                    {total === 0 && needed ? (
                      <span className="text-[10px] font-bold">GAP</span>
                    ) : total > 0 ? (
                      <>
                        <span className="font-semibold">{total}</span>
                        {cell && cell.unverified > 0 ? (
                          <span className="block text-[10px] opacity-80">
                            {cell.unverified} unv
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-gray">—</span>
                    )}
                  </Td>
                );
              })}
              <Td className="text-center font-bold text-charcoal">{rowTotal}</Td>
            </tr>
          );
        })}
      </Table>
      <div className="flex flex-wrap gap-3 text-[11px] text-gray">
        <LegendSwatch bg="#1B5E20" label="3+ candidates" />
        <LegendSwatch bg="#43A047" label="2 candidates" />
        <LegendSwatch bg="#A5D6A7" label="1 candidate" />
        <LegendSwatch bg="#FFEBEE" label="GAP — a client needs this, no candidates" />
      </div>
    </div>
  );
}

function LegendSwatch({ bg, label }: { bg: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden
        className="h-3 w-3 rounded-sm border border-black/10"
        style={{ background: bg }}
      />
      {label}
    </span>
  );
}
