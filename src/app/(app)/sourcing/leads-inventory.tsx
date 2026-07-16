"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/constants";
import type { BulkLeadActionInput, LeadListDTO, LeadListItemDTO } from "@/lib/validation/lead";
import { messageForFailure } from "@/lib/api/client";
import { Button, buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pager } from "@/components/ui/pager";
import { Select } from "@/components/ui/select";
import { Table } from "@/components/ui/table";
import { pageHrefFor } from "@/lib/pagination";
import { AddLeadButton, type ClientOption } from "./add-lead-modal";
import { ImportLeadsButton } from "./import-leads-modal";
import { LeadRow } from "./lead-row";
import { postBulkAction } from "./lib/lead-fetch";

/** A teammate option for the bulk "Assign owner…" select. */
export interface UserOption {
  id: string;
  name: string;
}

/** Bulk-delete undo window (legacy: "30s to undo"). */
const UNDO_SECONDS = 30;

/**
 * Client wrapper for the `/sourcing` inventory. The RSC SSR-renders one OFFSET page as
 * `initial` (numbered pager in the table footer — identical mechanics to the candidates list);
 * this component applies mutation results in place and re-seeds whenever the server page
 * changes. Bulk toolbar (`source_lead_bulk_action` parity): select-all covers the PAGE's rows;
 * bulk status/assign/client/outreach skip Promoted leads server-side; bulk delete confirms,
 * then offers a 30-second UNDO (bulk restore). Snoozed rows render pale-yellow with a 💤 badge
 * (date-aware). After a bulk action / import the RSC re-runs (`router.refresh`).
 */
export function LeadsInventory({
  initial,
  clients,
  users,
}: {
  initial: LeadListDTO;
  clients: ClientOption[];
  users: UserOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<LeadListItemDTO[]>(initial.leads);
  const [total, setTotal] = useState<number>(initial.total);
  const [announcement, setAnnouncement] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const [undo, setUndo] = useState<{ ids: string[]; secondsLeft: number } | null>(null);

  // The undo window ticks down once a second and disappears at 0 (legacy 30s toast).
  useEffect(() => {
    if (!undo) return;
    if (undo.secondsLeft <= 0) {
      setUndo(null);
      return;
    }
    const t = setTimeout(() => {
      setUndo((u) => (u ? { ...u, secondsLeft: u.secondsLeft - 1 } : null));
    }, 1000);
    return () => clearTimeout(t);
  }, [undo]);

  // Selection never outlives its rows.
  const idsKey = rows.map((r) => r.id).join("|");
  useEffect(() => {
    setSelected((prev) => {
      const live = new Set(rows.map((r) => r.id));
      const next = new Set([...prev].filter((id) => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  // Re-seed from the server page whenever the RSC re-renders (pager navigation, router.refresh
  // after bulk actions/imports) — local state stays authoritative between server reads.
  useEffect(() => {
    setRows(initial.leads);
    setTotal(initial.total);
    setSelected(new Set());
  }, [initial]);

  /** Re-run the RSC for the current URL (after bulk actions / imports change many rows). */
  function reload() {
    router.refresh();
  }

  function prependLead(lead: LeadListItemDTO) {
    setRows((prev) => (prev.some((r) => r.id === lead.id) ? prev : [lead, ...prev]));
    setTotal((t) => t + 1);
  }

  function replaceLead(lead: LeadListItemDTO) {
    setRows((prev) => prev.map((r) => (r.id === lead.id ? lead : r)));
  }

  function removeLead(id: string) {
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

  async function runBulk(input: BulkLeadActionInput, doneMessage: string) {
    setBulkPending(true);
    const result = await postBulkAction(input);
    setBulkPending(false);
    if (!result.ok) {
      toast.error(messageForFailure(result.failure));
      return;
    }
    const { affected, skipped } = result.data;
    toast.success(
      `${doneMessage} — ${affected} lead${affected === 1 ? "" : "s"}${skipped > 0 ? ` (${skipped} skipped)` : ""}`,
    );
    setAnnouncement(`${doneMessage}: ${affected} affected, ${skipped} skipped.`);
    if (input.action === "delete") {
      setUndo({ ids: [...input.ids], secondsLeft: UNDO_SECONDS });
    }
    reload();
  }

  function bulkDelete() {
    const ids = [...selected];
    if (!window.confirm(`Soft-delete ${ids.length} lead(s)? ${UNDO_SECONDS}s to undo.`)) return;
    void runBulk({ action: "delete", ids }, "Deleted");
  }

  async function undoDelete() {
    if (!undo) return;
    const ids = undo.ids;
    setUndo(null);
    const result = await postBulkAction({ action: "restore", ids });
    if (result.ok) {
      toast.success(
        `Restored ${result.data.affected} lead${result.data.affected === 1 ? "" : "s"}`,
      );
      reload();
    } else {
      toast.error(messageForFailure(result.failure));
    }
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
                { action: "status", ids: [...selected], value: e.target.value as LeadStatus },
                "Status changed",
              );
            }
          }}
          style={{ width: "11rem" }}
        >
          <option value="">Change status…</option>
          {LEAD_STATUSES.filter((s) => s !== "Promoted").map((s) => (
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
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Bulk change client"
          value=""
          disabled={bulkPending}
          onChange={(e) => {
            if (e.target.value) {
              void runBulk(
                {
                  action: "client",
                  ids: [...selected],
                  value: e.target.value === "__none" ? null : e.target.value,
                },
                "Client changed",
              );
            }
          }}
          style={{ width: "11rem" }}
        >
          <option value="">Change client…</option>
          <option value="__none">(no client)</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
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

  // Numbered pager INSIDE the table footer (shared `<Pager>`) — changing `?page=` re-runs the
  // RSC, and this component re-seeds from `initial` via the effect above.
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
        <Link href="/sourcing/inbound" className={buttonClasses("secondary", "sm")}>
          ✨ Inbound Triage
        </Link>
        <ImportLeadsButton onImported={reload} />
        <AddLeadButton clients={clients} onAdded={prependLead} size="sm" variant="success" />
      </div>

      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {undo ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-orange/30 bg-orange/10 px-3 py-2">
          <span className="text-sm text-charcoal">
            Deleted {undo.ids.length} lead{undo.ids.length === 1 ? "" : "s"}.
          </span>
          <Button type="button" size="xs" variant="secondary" onClick={() => void undoDelete()}>
            Undo ({undo.secondsLeft}s)
          </Button>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title="No leads match"
          description="Try clearing or widening the filters, or add a new lead to start sourcing."
        />
      ) : (
        <Table
          caption="Source leads"
          toolbar={bulkBar}
          footer={pagerFooter}
          columns={[
            <input
              key="all"
              type="checkbox"
              aria-label="Select all loaded leads"
              className="accent-white"
              checked={selected.size === rows.length && rows.length > 0}
              onChange={toggleAll}
            />,
            "Name",
            "Credential",
            "Location",
            "Client",
            "Status",
            "Last touch",
            "Owner",
            "Actions",
          ]}
        >
          {rows.map((lead) => (
            <LeadRow
              key={lead.id}
              lead={lead}
              selected={selected.has(lead.id)}
              onToggleSelect={() => toggle(lead.id)}
              onUpdated={replaceLead}
              onRemoved={removeLead}
              clients={clients}
            />
          ))}
        </Table>
      )}
    </div>
  );
}
