"use client";

import type { DocumentSummaryDTO } from "@/lib/validation/candidate";
import { Badge } from "@/components/ui/badge";
import { Table, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";

/** Storage status derived from the document's storage columns (no dedicated status field exists). */
function storageStatus(doc: DocumentSummaryDTO): string {
  if (doc.storageKey) return "Stored";
  if (doc.legacyUrl) return "Legacy link";
  return "Metadata only";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
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

export function ResumeTab({ documents }: { documents: DocumentSummaryDTO[] }) {
  if (documents.length === 0) {
    return (
      <EmptyState
        title="No résumé attached"
        description="Upload one via Parse Résumé — it will appear here once processed."
      />
    );
  }

  return (
    <Table caption="Résumé documents" columns={["File", "Type", "Status", "Uploaded", ""]}>
      {documents.map((doc) => (
        <tr key={doc.id} className="hover:bg-black/[0.02]">
          <Td className="font-medium">{doc.originalFilename}</Td>
          <Td>
            <Badge tone="neutral">{doc.type}</Badge>
          </Td>
          <Td>{storageStatus(doc)}</Td>
          <Td>{formatDate(doc.createdAt)}</Td>
          <Td>
            {safeHttpUrl(doc.legacyUrl) ? (
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
