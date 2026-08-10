"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { DocumentSummaryDTO } from "@/lib/validation/candidate";
import { getJson } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils/format-date";

/** Storage status derived from the document's storage columns (no dedicated status field exists). */
function storageStatus(doc: DocumentSummaryDTO): string {
  if (doc.storageKey) return "Stored";
  if (doc.legacyUrl) return "Legacy link";
  return "Metadata only";
}

/** Only ever render an http(s) link — never a `javascript:`/`data:` URL from imported data. */
function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/** Fetches a fresh signed URL on click (never persisted — see server/integrations/storage.ts) and
 *  opens it in a new tab. Only rendered for rows that actually have a `storageKey`. */
function DownloadButton({ documentId }: { documentId: string }) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    // Open the tab SYNCHRONOUSLY, inside the click handler — a browser only treats window.open as
    // a trusted user gesture if there's no `await` before it, so opening it after the fetch below
    // would get silently popup-blocked with no visible error. Navigate this tab once the signed
    // URL resolves instead. `win.opener = null` gets the same tabnabbing protection `noopener`
    // gives (which can't be used here — `noopener` makes window.open always return null, so
    // there'd be no reference left to navigate).
    const win = window.open("", "_blank");
    if (win) win.opener = null;
    setLoading(true);
    const res = await getJson<{ url: string }>(`/api/documents/${documentId}/download-url`);
    setLoading(false);
    if (res.ok) {
      if (win) win.location.href = res.data.url;
      else window.open(res.data.url, "_blank", "noopener,noreferrer");
    } else {
      win?.close();
      toast.error("Couldn't get a download link for this file.");
    }
  }

  return (
    <Button type="button" size="xs" variant="secondary" loading={loading} onClick={handleClick}>
      Download
    </Button>
  );
}

export function ResumeTab({
  documents,
  canDownload,
}: {
  documents: DocumentSummaryDTO[];
  /** `viewCredentials` — the same gate `GET /api/documents/:id/download-url` enforces server-side.
   *  Without it, Download would always 403; hide the live-looking button instead of offering an
   *  action that can never succeed. */
  canDownload: boolean;
}) {
  if (documents.length === 0) {
    return (
      <EmptyState
        title="No resume attached"
        description="Upload one via Parse Resume — it will appear here once processed."
      />
    );
  }

  return (
    <Table caption="Resume documents" columns={["File", "Type", "Status", "Uploaded", ""]}>
      {documents.map((doc) => (
        <tr key={doc.id} className="hover:bg-black/[0.02]">
          <Td className="font-medium">{doc.originalFilename}</Td>
          <Td>
            <Badge tone="neutral">{doc.type}</Badge>
          </Td>
          <Td>{storageStatus(doc)}</Td>
          <Td>{formatDate(doc.createdAt)}</Td>
          <Td>
            {doc.storageKey && canDownload ? (
              <DownloadButton documentId={doc.id} />
            ) : safeHttpUrl(doc.legacyUrl) ? (
              <a
                href={safeHttpUrl(doc.legacyUrl)!}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-navy hover:underline"
              >
                Open
              </a>
            ) : (
              <span className="text-gray">No preview yet</span>
            )}
          </Td>
        </tr>
      ))}
    </Table>
  );
}
