"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AlertsDTO, AlertBucketDTO, AlertCandidateDTO } from "@/lib/validation/alerts";
import type { MentionDTO } from "@/lib/validation/mention";
import { getJson, postJson } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";
import { Popover } from "@/components/ui/popover";

/** Legacy panel caps: 8 unread + 3 read mention rows; buckets are capped server-side at 5. */
const UNREAD_ROWS = 8;
const READ_ROWS = 3;
/** Poll cadence (legacy refreshed alongside its ~30s data poll; the bell is lighter, 60s). */
const POLL_MS = 60_000;

/**
 * The sidebar "Alerts" pill + panel (legacy header bell parity, adapted to the sidebar shell).
 * The badge counts UNREAD MENTIONS ONLY (legacy line 1194 — derived buckets never badge). The
 * panel lists @mentions (unread then a read tail), then the three viewer-scoped derived buckets:
 * OVERDUE / NEW TO REVIEW / VERIFICATION PENDING, each capped at 5 rows with its true count.
 * All scoping/counting is SERVER-side (`GET /api/alerts`); this component renders and polls.
 * Opening the panel marks nothing read — only clicking a mention or "Mark all read" does.
 */
export function AlertsBell({ viewerFirstName }: { viewerFirstName: string }) {
  const router = useRouter();
  const [alerts, setAlerts] = useState<AlertsDTO | null>(null);

  const refresh = useCallback(async () => {
    const res = await getJson<AlertsDTO>("/api/alerts");
    if (res.ok) setAlerts(res.data);
  }, []);

  useEffect(() => {
    void refresh();
    const iv = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(iv);
  }, [refresh]);

  const unread = alerts?.unread ?? 0;

  function openMention(mention: MentionDTO, close: () => void) {
    // Navigate immediately; the mark-read + refresh settle in the background (legacy re-fetched).
    void postJson("/api/mentions/read", { mentionId: mention.id }).then(() => refresh());
    close();
    router.push(`/candidates/${mention.candidateId}?tab=notes`);
  }

  function openCandidate(row: AlertCandidateDTO, tab: string | null, close: () => void) {
    close();
    router.push(`/candidates/${row.id}${tab ? `?tab=${tab}` : ""}`);
  }

  function markAllRead() {
    void postJson("/api/mentions/read", { all: true }).then(() => refresh());
  }

  return (
    <Popover
      align="end"
      panelClassName="w-96 max-w-[calc(100vw-2rem)] p-0 overflow-hidden"
      trigger={(open) => (
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-lg border px-3.5 py-1.5 text-sm font-semibold transition",
            open
              ? "border-navy bg-navy/10 text-navy"
              : "border-black/10 bg-black/[0.04] text-charcoal hover:bg-black/[0.07]",
          )}
        >
          Alerts
          {unread > 0 ? (
            <span
              aria-label={`${unread} unread mentions`}
              className="rounded-full bg-red px-1.5 py-px text-[10px] font-bold text-white"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </span>
      )}
    >
      {(close) => (
        <AlertsPanel
          alerts={alerts}
          viewerFirstName={viewerFirstName}
          onRefresh={refresh}
          onOpenMention={(m) => openMention(m, close)}
          onOpenCandidate={(row, tab) => openCandidate(row, tab, close)}
          onMarkAllRead={markAllRead}
        />
      )}
    </Popover>
  );
}

/** Panel body — mounted only while open, so its effect re-fetches fresh data per open. */
function AlertsPanel({
  alerts,
  viewerFirstName,
  onRefresh,
  onOpenMention,
  onOpenCandidate,
  onMarkAllRead,
}: {
  alerts: AlertsDTO | null;
  viewerFirstName: string;
  onRefresh: () => Promise<void>;
  onOpenMention: (mention: MentionDTO) => void;
  onOpenCandidate: (row: AlertCandidateDTO, tab: string | null) => void;
  onMarkAllRead: () => void;
}) {
  useEffect(() => {
    void onRefresh();
    // Refresh once per open — deliberately not on every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mentions = alerts?.mentions ?? [];
  const unreadMentions = mentions.filter((m) => !m.readAt).slice(0, UNREAD_ROWS);
  const readMentions = mentions.filter((m) => m.readAt).slice(0, READ_ROWS);

  return (
    <div className="flex max-h-[80vh] flex-col">
      <div className="flex items-center justify-between border-b border-black/5 px-4 py-2.5">
        <span className="text-sm font-bold text-charcoal">Alerts</span>
        {(alerts?.unread ?? 0) > 0 ? (
          <button
            type="button"
            onClick={onMarkAllRead}
            className="text-xs font-semibold text-navy hover:underline"
          >
            Mark all read
          </button>
        ) : null}
      </div>

      <div className="overflow-y-auto py-1.5">
        {/* @MENTIONS */}
        <SectionHeader className="text-charcoal">
          @Mentions
          {(alerts?.unread ?? 0) > 0 ? ` · ${alerts!.unread} new` : ""}
        </SectionHeader>
        {mentions.length === 0 ? (
          <p className="px-4 py-1.5 text-xs text-gray">
            No mentions yet. Teammates can tag you with @{viewerFirstName} in any candidate note.
          </p>
        ) : (
          <>
            {unreadMentions.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onOpenMention(m)}
                className="block w-full border-l-[3px] border-navy bg-navy/5 px-4 py-2 text-left hover:bg-navy/10"
              >
                <span className="block text-xs text-charcoal">
                  <span className="font-semibold text-navy">{m.authorName ?? "Someone"}</span>{" "}
                  mentioned you on <span className="font-semibold">{m.candidateName}</span>
                </span>
                <span className="block truncate text-xs text-gray">{m.excerpt}</span>
                <span className="block text-[10px] text-gray">
                  {new Date(m.createdAt).toLocaleString()}
                </span>
              </button>
            ))}
            {readMentions.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onOpenMention(m)}
                className="block w-full px-4 py-1.5 text-left opacity-55 hover:opacity-80"
              >
                <span className="block text-xs text-charcoal">
                  {m.authorName ?? "Someone"} · {m.candidateName}
                </span>
                <span className="block truncate text-xs text-gray">{m.excerpt}</span>
              </button>
            ))}
          </>
        )}

        {/* Derived buckets — viewer-scoped, capped at 5 server-side, true counts in headers. */}
        <AlertBucket
          title="Overdue"
          headerClass="text-orange"
          bucket={alerts?.overdue}
          rowAccent="border-l-[3px] border-orange"
          subline={(row) => `${row.statusLabel} · ${row.clientName ?? "(no client)"}`}
          onOpen={(row) => onOpenCandidate(row, null)}
        />
        <AlertBucket
          title="New to review"
          headerClass="text-navy"
          bucket={alerts?.newToReview}
          subline={(row) => `${row.credential ?? "—"} · ${row.clientName ?? "(no client)"}`}
          onOpen={(row) => onOpenCandidate(row, null)}
        />
        <AlertBucket
          title="Verification pending"
          headerClass="text-purple"
          bucket={alerts?.verificationPending}
          subline={(row) => `${row.credential ?? "—"} · ${row.licenseState ?? "—"}`}
          onOpen={(row) => onOpenCandidate(row, "license")}
        />
      </div>
    </div>
  );
}

function SectionHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("px-4 pt-2.5 pb-1 text-[10px] font-bold tracking-wider uppercase", className)}>
      {children}
    </p>
  );
}

function AlertBucket({
  title,
  headerClass,
  bucket,
  rowAccent,
  subline,
  onOpen,
}: {
  title: string;
  headerClass: string;
  bucket: AlertBucketDTO | undefined;
  rowAccent?: string;
  subline: (row: AlertCandidateDTO) => string;
  onOpen: (row: AlertCandidateDTO) => void;
}) {
  if (!bucket || bucket.count === 0) return null;
  return (
    <>
      <SectionHeader className={headerClass}>
        {title} · {bucket.count}
      </SectionHeader>
      {bucket.items.map((row) => (
        <button
          key={row.id}
          type="button"
          onClick={() => onOpen(row)}
          className={cn("block w-full px-4 py-1.5 text-left hover:bg-black/5", rowAccent)}
        >
          <span className="block text-xs font-semibold text-charcoal">{row.name}</span>
          <span className="block text-xs text-gray">{subline(row)}</span>
        </button>
      ))}
    </>
  );
}
