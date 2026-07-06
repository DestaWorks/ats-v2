"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { leadStatusTone } from "@/lib/constants";
import type { LeadListDTO, LeadListItemDTO } from "@/lib/validation/lead";
import { formatDate } from "@/lib/utils/format-date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { AddLeadButton, type ClientOption } from "./add-lead-modal";
import { LeadFilters } from "./lead-filters";
import { LeadRowActions } from "./lead-row-actions";
import { fetchLeadsPage } from "./lib/lead-fetch";

/**
 * Client wrapper for the `/sourcing` inventory. The RSC SSR-renders page 1 as `initial`; this
 * component owns the accumulated rows: it appends further keyset pages via "Load more"
 * (`GET /api/leads/list` carrying the URL filters, deduped by id), and applies mutation results
 * IN-PLACE — add prepends the fresh lead, outreach/respond replace the row from the returned detail,
 * delete/promote drop it — so the table stays authoritative without a full refetch. It is REMOUNTED
 * (keyed on the server-filter signature by the RSC) whenever a filter changes, so `initial` is always
 * page 1 for the current query. "Showing N of M" tracks the honest filtered total (±1 on add/remove).
 */
export function LeadsInventory({
  initial,
  clients,
}: {
  initial: LeadListDTO;
  clients: ClientOption[];
}) {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<LeadListItemDTO[]>(initial.leads);
  const [nextCursor, setNextCursor] = useState<string | null>(initial.nextCursor);
  const [hasMore, setHasMore] = useState<boolean>(initial.hasMore);
  const [total, setTotal] = useState<number>(initial.total);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <LeadFilters />
        <AddLeadButton clients={clients} onAdded={prependLead} size="sm" />
      </div>

      <div className="flex items-center">
        <span className="text-xs text-gray">
          Showing {rows.length} of {total}
        </span>
      </div>

      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No leads match"
          description="Try clearing or widening the filters, or add a new lead to start sourcing."
        />
      ) : (
        <Table
          caption="Source leads"
          columns={["Name", "Contact", "Status", "Outreach", "Last outreach", "Source", "Actions"]}
        >
          {rows.map((lead) => (
            <tr key={lead.id} className="transition hover:bg-black/[0.03]">
              <Td>
                <span className="font-semibold text-navy">{lead.name}</span>
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
          ))}
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
