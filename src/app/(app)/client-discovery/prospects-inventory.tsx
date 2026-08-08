"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { PROSPECT_STATUSES } from "@/lib/constants";
import type { ProspectListDTO, ProspectListItemDTO } from "@/lib/validation/prospect";
import { messageForFailure } from "@/lib/api/client";
import { Button, buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pager } from "@/components/ui/pager";
import { Select } from "@/components/ui/select";
import { Table } from "@/components/ui/table";
import { pageHrefFor } from "@/lib/pagination";
import { AddProspectButton } from "./add-prospect-modal";
import { ProspectRow } from "./prospect-row";
import { postBulkProspectAction } from "./lib/prospect-fetch";

/**
 * Client wrapper for the `/client-discovery` pipeline inventory — mirrors
 * `sourcing/leads-inventory.tsx`, simplified to this domain's actual bulk actions (delete/
 * restore/status/assign, no client/outreach). The RSC SSR-renders one OFFSET page as `initial`;
 * this component applies mutation results in place and re-seeds whenever the server page changes.
 */
export function ProspectsInventory({
  initial,
  owners,
}: {
  initial: ProspectListDTO;
  owners: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<ProspectListItemDTO[]>(initial.prospects);
  const [total, setTotal] = useState<number>(initial.total);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);

  const idsKey = rows.map((r) => r.id).join("|");
  useEffect(() => {
    setSelected((prev) => {
      const live = new Set(rows.map((r) => r.id));
      const next = new Set([...prev].filter((id) => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  useEffect(() => {
    setRows(initial.prospects);
    setTotal(initial.total);
    setSelected(new Set());
  }, [initial]);

  function reload() {
    router.refresh();
  }

  function prepend(prospect: ProspectListItemDTO) {
    setRows((prev) => (prev.some((r) => r.id === prospect.id) ? prev : [prospect, ...prev]));
    setTotal((t) => t + 1);
  }

  function replace(prospect: ProspectListItemDTO) {
    setRows((prev) => prev.map((r) => (r.id === prospect.id ? prospect : r)));
  }

  function remove(id: string) {
    setRows((prev) => {
      if (!prev.some((r) => r.id === id)) return prev;
      setTotal((t) => Math.max(0, t - 1));
      return prev.filter((r) => r.id !== id);
    });
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  }

  async function runBulk(input: Parameters<typeof postBulkProspectAction>[0], doneMessage: string) {
    setBulkPending(true);
    const result = await postBulkProspectAction(input);
    setBulkPending(false);
    if (!result.ok) {
      toast.error(messageForFailure(result.failure));
      return;
    }
    const { affected, skipped } = result.data;
    toast.success(
      `${doneMessage} — ${affected} prospect${affected === 1 ? "" : "s"}${skipped > 0 ? ` (${skipped} skipped)` : ""}`,
    );
    reload();
  }

  function bulkDelete() {
    const ids = [...selected];
    if (!window.confirm(`Soft-delete ${ids.length} prospect(s)?`)) return;
    void runBulk({ action: "delete", ids }, "Deleted");
  }

  const bulkBar =
    selected.size > 0 ? (
      <div className="flex flex-wrap items-center gap-2 border-b border-black/5 px-1 pb-3">
        <span className="text-xs font-semibold text-charcoal">{selected.size} selected</span>
        <Select
          aria-label="Bulk change status"
          value=""
          disabled={bulkPending}
          onChange={(e) => {
            if (e.target.value) {
              void runBulk(
                { action: "status", ids: [...selected], value: e.target.value as never },
                "Status changed",
              );
            }
          }}
          style={{ width: "11rem" }}
        >
          <option value="">Change status…</option>
          {PROSPECT_STATUSES.filter((s) => s !== "Client").map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Bulk assign owner"
          value=""
          disabled={bulkPending}
          onChange={(e) => {
            if (e.target.value) {
              void runBulk(
                { action: "assign", ids: [...selected], value: e.target.value },
                "Owner assigned",
              );
            }
          }}
          style={{ width: "11rem" }}
        >
          <option value="">Assign owner…</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
        <Button type="button" size="xs" variant="danger" loading={bulkPending} onClick={bulkDelete}>
          Delete
        </Button>
        <Button
          type="button"
          size="xs"
          variant="secondary"
          disabled={bulkPending}
          onClick={() => setSelected(new Set())}
        >
          Clear
        </Button>
      </div>
    ) : null;

  const { page, pageSize, totalPages, hasPrev, hasNext } = initial;
  const from = (page - 1) * pageSize + 1;
  const to = (page - 1) * pageSize + rows.length;
  const pHref = (n: number) => pageHrefFor(pathname, searchParams, n);
  const pagerFooter = (
    <Pager
      page={page}
      totalPages={totalPages}
      hasPrev={hasPrev}
      hasNext={hasNext}
      from={rows.length === 0 ? 0 : from}
      to={to}
      total={total}
      hrefFor={pHref}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Link href="/client-discovery/search" className={buttonClasses("secondary", "sm")}>
          🔍 Search NPPES
        </Link>
        <AddProspectButton onAdded={prepend} size="sm" variant="success" />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No prospects match"
          description="Try clearing the filters, search NPPES for new practices, or add one manually."
        />
      ) : (
        <Table
          caption="Client Discovery prospects"
          toolbar={bulkBar}
          footer={pagerFooter}
          columns={[
            <input
              key="all"
              type="checkbox"
              aria-label="Select all loaded prospects"
              className="accent-white"
              checked={selected.size === rows.length && rows.length > 0}
              onChange={toggleAll}
            />,
            "Practice",
            "Specialty",
            "Location",
            "Status",
            "Owner",
            "Actions",
          ]}
        >
          {rows.map((prospect) => (
            <ProspectRow
              key={prospect.id}
              prospect={prospect}
              selected={selected.has(prospect.id)}
              onToggleSelect={() => toggle(prospect.id)}
              onUpdated={replace}
              onRemoved={remove}
            />
          ))}
        </Table>
      )}
    </div>
  );
}
