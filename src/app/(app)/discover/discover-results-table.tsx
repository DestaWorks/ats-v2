"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { stateBoardLink } from "@/lib/constants";
import type { DiscoverResultItemDTO } from "@/lib/validation/discover";
import { messageForFailure } from "@/lib/api/client";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { Table, Td } from "@/components/ui/table";
import { postDiscoverAdd } from "./lib/discover-fetch";

export interface ClientOption {
  id: string;
  name: string;
}

const STATUS_TONE: Record<DiscoverResultItemDTO["dupStatus"], BadgeTone> = {
  new: "success",
  in_sourcing: "amber",
  in_pipeline: "navy",
};

const STATUS_LABEL: Record<DiscoverResultItemDTO["dupStatus"], string> = {
  new: "+ New",
  in_sourcing: "In Sourcing",
  in_pipeline: "In Pipeline",
};

/** Results table for a Discover (NPPES) search (Wave 2.7) — mirrors `LeadsInventory`'s bulk-select
 *  pattern (`sourcing/leads-inventory.tsx`): a `selected: Set<npi>` + toolbar with a target-client
 *  select and an "Add to Sourcing" bulk action. Only `dupStatus === "new"` rows are selectable. */
export function DiscoverResultsTable({
  results,
  clients,
}: {
  results: DiscoverResultItemDTO[];
  clients: ClientOption[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set());
  const [clientId, setClientId] = useState("");
  const [pending, setPending] = useState(false);

  const selectable = results.filter((r) => r.dupStatus === "new" && !added.has(r.npi));

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
        name: `${r.firstName} ${r.lastName}`.trim(),
        credential: r.credential,
        state: r.state,
        city: r.city,
        phone: r.phone,
        taxonomyDesc: r.taxonomyDesc,
        licenseNumber: r.licenseNumber,
      }));
    setPending(true);
    const result = await postDiscoverAdd(rows, clientId || null);
    setPending(false);
    if (!result.ok) {
      toast.error(messageForFailure(result.failure));
      return;
    }
    const { added: addedCount, skipped } = result.data;
    toast.success(
      `Added ${addedCount} to Sourcing${skipped > 0 ? ` (${skipped} skipped — already sourced)` : ""}`,
    );
    setAdded((prev) => new Set([...prev, ...rows.map((r) => r.npi)]));
    setSelected(new Set());
    router.refresh();
  }

  if (results.length === 0) {
    return (
      <EmptyState
        title="No matches"
        description="Try a different provider type, state, or name — NPPES needs at least one of those to search."
      />
    );
  }

  return (
    <Table
      caption="NPPES search results"
      columns={[
        <input
          key="select-all"
          type="checkbox"
          aria-label="Select all new results"
          checked={selectable.length > 0 && selected.size === selectable.length}
          onChange={toggleAll}
          disabled={selectable.length === 0}
        />,
        "Name",
        "Credential",
        "Location",
        "NPI",
        "License",
        "Status",
        "",
      ]}
      toolbar={
        selected.size > 0 ? (
          <>
            <span className="text-xs font-semibold text-charcoal">{selected.size} selected</span>
            <Select
              aria-label="Target client"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              style={{ width: "11rem" }}
            >
              <option value="">Unassigned</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              variant="success"
              size="sm"
              loading={pending}
              onClick={addSelected}
            >
              Add {selected.size} to Sourcing
            </Button>
          </>
        ) : null
      }
    >
      {results.map((row) => {
        const board = stateBoardLink(row.licenseState ?? row.state);
        const isAdded = added.has(row.npi);
        return (
          <tr key={row.npi}>
            <Td>
              {row.dupStatus === "new" && !isAdded ? (
                <input
                  type="checkbox"
                  aria-label={`Select ${row.firstName} ${row.lastName}`}
                  checked={selected.has(row.npi)}
                  onChange={() => toggle(row.npi)}
                />
              ) : null}
            </Td>
            <Td className="font-medium">
              {row.firstName} {row.lastName}
            </Td>
            <Td>{row.credential ?? "—"}</Td>
            <Td>{[row.city, row.state].filter(Boolean).join(", ") || "—"}</Td>
            <Td className="font-mono text-xs">{row.npi}</Td>
            <Td>
              {row.licenseNumber ?? "—"}
              {board ? (
                <>
                  {" · "}
                  <a
                    href={board.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={
                      board.mapped ? "text-navy hover:underline" : "text-gray hover:underline"
                    }
                  >
                    Verify →
                  </a>
                </>
              ) : null}
            </Td>
            <Td>
              <Badge tone={isAdded ? "success" : STATUS_TONE[row.dupStatus]}>
                {isAdded ? "Added" : STATUS_LABEL[row.dupStatus]}
              </Badge>
              {row.dupMatchLabel && !isAdded ? (
                <span className="ml-1 text-xs text-gray">({row.dupMatchLabel})</span>
              ) : null}
            </Td>
            <Td>
              {row.dupStatus === "in_pipeline" && row.dupMatchId ? (
                <Link
                  href={`/candidates/${row.dupMatchId}`}
                  className="text-xs text-navy hover:underline"
                >
                  View
                </Link>
              ) : row.dupStatus === "in_sourcing" ? (
                <Link href="/sourcing" className="text-xs text-navy hover:underline">
                  View
                </Link>
              ) : null}
            </Td>
          </tr>
        );
      })}
    </Table>
  );
}
