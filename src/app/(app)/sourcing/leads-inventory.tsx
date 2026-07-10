"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { LEAD_STATUSES, leadStatusTone, type LeadStatus } from "@/lib/constants";
import type { BulkLeadActionInput, LeadListDTO, LeadListItemDTO } from "@/lib/validation/lead";
import { messageForFailure } from "@/lib/api/client";
import { formatDate } from "@/lib/utils/format-date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { Table, Td } from "@/components/ui/table";
import { AddLeadButton, type ClientOption } from "./add-lead-modal";
import { ImportLeadsButton } from "./import-leads-modal";
import { LeadRowActions, isSnoozed } from "./lead-row-actions";
import { fetchLeadsPage, postBulkAction } from "./lib/lead-fetch";

/** A teammate option for the bulk "Assign owner…" select. */
export interface UserOption {
  id: string;
  name: string;
}

/** Bulk-delete undo window (legacy: "30s to undo"). */
const UNDO_SECONDS = 30;

/**
 * Client wrapper for the `/sourcing` inventory. The RSC SSR-renders page 1 as `initial`; this
 * component owns the accumulated rows: keyset "Load more", in-place mutation results, and the
 * bulk toolbar (`source_lead_bulk_action` parity): select-all covers the LOADED rows; bulk
 * status/assign/client/outreach skip Promoted leads server-side; bulk delete confirms, then
 * offers a 30-second UNDO (bulk restore). Snoozed rows render pale-yellow with a 💤 badge
 * (date-aware). After a bulk action the list re-seeds page 1 (statuses/rows may have changed
 * beyond what's loaded).
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
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<LeadListItemDTO[]>(initial.leads);
  const [nextCursor, setNextCursor] = useState<string | null>(initial.nextCursor);
  const [hasMore, setHasMore] = useState<boolean>(initial.hasMore);
  const [total, setTotal] = useState<number>(initial.total);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  async function loadMore() {
    if (!nextCursor || loading) return;
    setLoading(true);
    setError(null);
    try {
      const page = await fetchLeadsPage(searchParams, nextCursor);
      const seen = new Set(rows.map((r) => r.id));
      const merged = [...rows, ...page.leads.filter((r) => !seen.has(r.id))];
      const added = merged.length - rows.length;
      setRows(merged);
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setAnnouncement(`Loaded ${added} more. Showing ${merged.length} of ${total}.`);
    } catch {
      setError("Couldn't load more leads. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  /** Re-seed page 1 for the current filters (after bulk actions / imports change many rows). */
  async function reload() {
    try {
      const page = await fetchLeadsPage(searchParams, null);
      setRows(page.leads);
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setTotal(page.total);
      setSelected(new Set());
    } catch {
      setError("Couldn't refresh the list. Please reload the page.");
    }
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
    await reload();
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
      await reload();
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
          className="w-40"
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
          className="w-40"
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
          className="w-40"
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-gray">
          Showing {rows.length} of {total}
        </span>
        <div className="flex items-center gap-2">
          <ImportLeadsButton onImported={() => void reload()} />
          <AddLeadButton clients={clients} onAdded={prependLead} size="sm" variant="success" />
        </div>
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
            "Contact",
            "Status",
            "Outreach",
            "Last outreach",
            "Source",
            "Actions",
          ]}
        >
          {rows.map((lead) => {
            const snoozed = isSnoozed(lead.snoozedUntil);
            return (
              <tr
                key={lead.id}
                className={
                  lead.deletedAt
                    ? "bg-red/5 opacity-70 transition"
                    : snoozed
                      ? "bg-orange/5 transition hover:bg-orange/10"
                      : "transition hover:bg-black/[0.03]"
                }
              >
                <Td>
                  <input
                    type="checkbox"
                    aria-label={`Select ${lead.name}`}
                    className="accent-navy"
                    checked={selected.has(lead.id)}
                    onChange={() => toggle(lead.id)}
                  />
                </Td>
                <Td>
                  <span className="font-semibold text-navy">{lead.name}</span>
                  {lead.deletedAt ? (
                    <Badge tone="danger" size="sm" className="ml-1.5 align-middle">
                      Deleted
                    </Badge>
                  ) : null}
                  {snoozed ? (
                    <Badge tone="amber" size="sm" className="ml-1.5 align-middle">
                      💤 until {lead.snoozedUntil!.slice(0, 10)}
                    </Badge>
                  ) : null}
                  {lead.credential ? (
                    <span className="block text-xs text-gray">{lead.credential}</span>
                  ) : null}
                </Td>
                <Td>
                  {lead.email ? <span className="block text-charcoal">{lead.email}</span> : null}
                  {lead.phone ? <span className="block text-gray">{lead.phone}</span> : null}
                  {!lead.email && !lead.phone ? <span className="text-gray">—</span> : null}
                </Td>
                <Td>
                  {lead.status === "Promoted" && lead.promotedCandidateId ? (
                    <Link
                      href={`/candidates/${lead.promotedCandidateId}`}
                      className="focus-visible:ring-2 focus-visible:ring-navy focus-visible:outline-none"
                    >
                      <Badge tone={leadStatusTone(lead.status)}>{lead.status} →</Badge>
                    </Link>
                  ) : (
                    <Badge tone={leadStatusTone(lead.status)}>{lead.status}</Badge>
                  )}
                </Td>
                <Td>{lead.outreachCount}</Td>
                <Td>{formatDate(lead.lastOutreachAt)}</Td>
                <Td>{lead.source ?? <span className="text-gray">—</span>}</Td>
                <Td>
                  <LeadRowActions lead={lead} onUpdated={replaceLead} onRemoved={removeLead} />
                </Td>
              </tr>
            );
          })}
        </Table>
      )}

      {error ? (
        <p role="alert" className="text-sm text-red">
          {error}
        </p>
      ) : null}

      {hasMore ? (
        <div className="flex justify-center pt-1">
          <Button type="button" variant="secondary" size="sm" onClick={loadMore} loading={loading}>
            {loading ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : rows.length > 0 ? (
        <p className="pt-1 text-center text-xs text-gray">End of results.</p>
      ) : null}
    </div>
  );
}
