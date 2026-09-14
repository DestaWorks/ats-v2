"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ProspectSearchResultItemDTO } from "@destaworks/contracts/validation/prospect";
import { messageForFailure } from "@/lib/api/client";
import { Badge } from "@destaworks/ui/badge";
import { Button } from "@destaworks/ui/button";
import { EmptyState } from "@destaworks/ui/empty-state";
import { Table, Td } from "@destaworks/ui/table";
import { postBulkAddFromSearch } from "../lib/prospect-fetch";

/** Results table for a Client Discovery NPPES search — mirrors `discover/discover-results-table.tsx`'s
 *  bulk-select pattern. Only rows not already tracked as a Prospect are selectable. */
export function SearchResultsTable({ results }: { results: ProspectSearchResultItemDTO[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState(false);

  const selectable = results.filter((r) => !r.alreadyTracked && !added.has(r.npi));

  function toggle(npi: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(npi)) next.delete(npi);
      else next.add(npi);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === selectable.length ? new Set() : new Set(selectable.map((r) => r.npi)),
    );
  }

  async function addSelected() {
    const rows = results
      .filter((r) => selected.has(r.npi))
      .map((r) => ({
        npi: r.npi,
        practiceName: r.practiceName,
        taxonomy: r.taxonomy,
        city: r.city,
        state: r.state,
        zip: r.zip,
        phone: r.phone,
      }));
    setPending(true);
    const result = await postBulkAddFromSearch({ rows });
    setPending(false);
    if (!result.ok) {
      toast.error(messageForFailure(result.failure));
      return;
    }
    const { added: addedCount, skipped } = result.data;
    toast.success(
      `Added ${addedCount} to the pipeline${skipped > 0 ? ` (${skipped} skipped — already tracked)` : ""}`,
    );
    setAdded((prev) => new Set([...prev, ...rows.map((r) => r.npi)]));
    setSelected(new Set());
    router.refresh();
  }

  if (results.length === 0) {
    return (
      <EmptyState
        title="No matches"
        description="Try a different specialty, state, city, or zip — NPPES needs at least one of those to search."
      />
    );
  }

  return (
    <Table
      caption="NPPES organization search results"
      columns={[
        <input
          key="select-all"
          type="checkbox"
          aria-label="Select all new results"
          checked={selectable.length > 0 && selected.size === selectable.length}
          onChange={toggleAll}
          disabled={selectable.length === 0}
        />,
        "Practice",
        "Specialty",
        "Location",
        "NPI",
        "Status",
      ]}
      toolbar={
        selected.size > 0 ? (
          <>
            <span className="text-xs font-semibold text-charcoal">{selected.size} selected</span>
            <Button
              type="button"
              variant="success"
              size="sm"
              loading={pending}
              onClick={() => void addSelected()}
            >
              Add {selected.size} to Pipeline
            </Button>
          </>
        ) : null
      }
    >
      {results.map((row) => {
        const isAdded = added.has(row.npi);
        return (
          <tr key={row.npi}>
            <Td>
              {!row.alreadyTracked && !isAdded ? (
                <input
                  type="checkbox"
                  aria-label={`Select ${row.practiceName}`}
                  checked={selected.has(row.npi)}
                  onChange={() => toggle(row.npi)}
                />
              ) : null}
            </Td>
            <Td className="font-medium">{row.practiceName || "—"}</Td>
            <Td>{row.taxonomy ?? "—"}</Td>
            <Td>{[row.city, row.state].filter(Boolean).join(", ") || "—"}</Td>
            <Td className="font-mono text-xs">{row.npi}</Td>
            <Td>
              <Badge tone={isAdded || row.alreadyTracked ? "success" : "amber"}>
                {isAdded ? "Added" : row.alreadyTracked ? "In Pipeline" : "+ New"}
              </Badge>
            </Td>
          </tr>
        );
      })}
    </Table>
  );
}
