"use client";

import { useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import type { GetDocumentDownloadUrlResponse } from "@/app/api/documents/[id]/download-url/route";
import type { DocumentSummaryDTO } from "@destaworks/contracts/validation/candidate";
import { getJson, messageForFailure } from "@/lib/api/client";
import { uploadToStorage } from "@/lib/api/upload";
import { Modal } from "@destaworks/ui/modal";
import { Spinner } from "@destaworks/ui/spinner";
import { Table, Td } from "@destaworks/ui/table";
import { EmptyState } from "@destaworks/ui/empty-state";
import { cn } from "@destaworks/domain/utils/cn";
import { formatDate } from "@destaworks/domain/utils/format-date";
import { extractPdfText } from "../../resume/lib/pdf-extract";
import { postResumeUpload } from "./lib/detail-fetch";

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

/** One row — click anywhere on it to preview. A stored file fetches a fresh signed URL (never
 *  persisted — see server/integrations/storage.ts) and renders the PDF inline in a modal; a
 *  legacy-only row opens its external link in a new tab instead; anything else isn't clickable. */
function ResumeRow({ doc, canDownload }: { doc: DocumentSummaryDTO; canDownload: boolean }) {
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const legacyUrl = safeHttpUrl(doc.legacyUrl);
  const canPreview = Boolean(doc.storageKey && canDownload);
  const clickable = canPreview || Boolean(legacyUrl);

  async function handleClick() {
    if (canPreview) {
      setLoading(true);
      const res = await getJson<GetDocumentDownloadUrlResponse>(
        `/api/documents/${doc.id}/download-url`,
      );
      setLoading(false);
      if (res.ok) setPreviewUrl(res.data.url);
      else toast.error("Couldn't get a preview link for this file.");
    } else if (legacyUrl) {
      window.open(legacyUrl, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <>
      <tr
        onClick={clickable ? () => void handleClick() : undefined}
        className={cn(clickable && "cursor-pointer hover:bg-black/[0.03]", loading && "opacity-60")}
      >
        <Td className="font-medium">
          {doc.originalFilename}
          {!clickable ? <span className="ml-2 text-xs text-gray">No preview yet</span> : null}
        </Td>
        <Td>{formatDate(doc.createdAt)}</Td>
      </tr>
      <Modal
        open={previewUrl !== null}
        onClose={() => setPreviewUrl(null)}
        title={doc.originalFilename}
      >
        {previewUrl ? (
          <div className="flex flex-col gap-2">
            <iframe
              src={previewUrl}
              title={doc.originalFilename}
              className="h-[75vh] w-full rounded-lg border border-black/10"
            />
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="self-end text-xs font-semibold text-navy hover:underline"
            >
              Open in new tab
            </a>
          </div>
        ) : null}
      </Modal>
    </>
  );
}

/** A ~150-page PDF's extracted text stays well under this; a hard cap keeps a malformed/huge file
 *  from ever reaching the request body (mirrors `resume/lib/pdf-extract.ts`'s own cap). */
const MAX_RESUME_TEXT_CHARS = 100_000;

type UploadStage = "idle" | "reading" | "uploading" | "saving";

const STAGE_LABEL: Record<Exclude<UploadStage, "idle">, string> = {
  reading: "Reading the PDF…",
  uploading: "Uploading to storage…",
  saving: "Attaching to this candidate…",
};

/** Attach a resume straight to THIS candidate — no AI extraction, no candidate matching (this
 *  candidate is already known). PDF text is extracted client-side (best-effort — a failure here
 *  never blocks the attach, it just means no `extractedText`); when Storage is configured the raw
 *  bytes also go straight to it via a signed URL, same flow the Parse Resume page already uses.
 *  A drag-and-drop zone (legacy-parity styling) surfaces which of the three steps is in flight,
 *  rather than a single opaque spinner, since a slow Storage PUT can otherwise look stuck. */
function UploadResumeButton({
  candidateId,
  storageEnabled,
  onUploaded,
  announce,
}: {
  candidateId: string;
  storageEnabled: boolean;
  onUploaded: (doc: DocumentSummaryDTO) => void;
  announce: (message: string) => void;
}) {
  const [stage, setStage] = useState<UploadStage>("idle");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = stage !== "idle";

  async function storageKeyFor(file: File): Promise<string | undefined> {
    if (!storageEnabled) return undefined;
    const result = await uploadToStorage({
      filename: file.name,
      mimeType: file.type || "application/pdf",
      body: file,
    });
    return result.ok ? result.storageKey : undefined;
  }

  async function handleFile(file: File | undefined) {
    if (!file || busy) return;
    if (!/\.pdf$/i.test(file.name)) {
      toast.error("That's not a PDF file.");
      return;
    }
    try {
      setStage("reading");
      let extractedText: string | undefined;
      try {
        const text = await extractPdfText(file);
        extractedText = text.length > 0 ? text.slice(0, MAX_RESUME_TEXT_CHARS) : undefined;
      } catch {
        // Best-effort — an unreadable/scanned PDF still attaches, just without extracted text.
      }
      setStage("uploading");
      const storageKey = await storageKeyFor(file);
      setStage("saving");
      const res = await postResumeUpload(candidateId, {
        originalFilename: file.name,
        mimeType: file.type || "application/pdf",
        extractedText,
        storageKey,
      });
      if (res.ok) {
        onUploaded(res.data);
        toast.success(`${file.name} uploaded`);
        announce("Resume uploaded");
      } else {
        toast.error(messageForFailure(res.failure));
      }
    } finally {
      setStage("idle");
      setDragOver(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div
      role="button"
      aria-busy={busy}
      aria-label="Upload resume PDF"
      tabIndex={busy ? -1 : 0}
      onClick={() => {
        if (!busy) inputRef.current?.click();
      }}
      onKeyDown={(e) => {
        if (!busy && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e: DragEvent) => {
        e.preventDefault();
        if (!busy) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e: DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        if (!busy) void handleFile(e.dataTransfer.files?.[0]);
      }}
      className={cn(
        "flex items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 transition",
        busy
          ? "cursor-wait border-black/10 bg-black/[0.015]"
          : "cursor-pointer border-black/15 bg-black/[0.02] hover:border-navy/40 hover:bg-navy/[0.03]",
        dragOver && !busy && "border-navy bg-navy/5",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="sr-only"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      {busy ? (
        <>
          <Spinner className="h-5 w-5" />
          <span className="text-sm font-semibold text-navy">{STAGE_LABEL[stage]}</span>
        </>
      ) : (
        <>
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy/10 text-navy"
          >
            <svg
              viewBox="0 0 20 20"
              className="h-4.5 w-4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10 13V4M6 8l4-4 4 4M3.5 13.5v2a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5v-2" />
            </svg>
          </span>
          <span className="flex flex-col">
            <span className="text-sm font-semibold text-charcoal">
              {dragOver ? "Drop the resume here" : "Upload resume"}
            </span>
            <span className="text-xs text-gray">Click to browse, or drag a PDF here</span>
          </span>
        </>
      )}
    </div>
  );
}

export function ResumeTab({
  candidateId,
  documents,
  canDownload,
  storageEnabled,
  onUploaded,
  announce,
}: {
  candidateId: string;
  documents: DocumentSummaryDTO[];
  /** `viewCredentials` — the same gate `GET /api/documents/:id/download-url` enforces server-side.
   *  Without it, Preview would always 403; the row isn't made clickable for an action that can
   *  never succeed. */
  canDownload: boolean;
  storageEnabled: boolean;
  onUploaded: (doc: DocumentSummaryDTO) => void;
  announce: (message: string) => void;
}) {
  const uploadControl = (
    <UploadResumeButton
      candidateId={candidateId}
      storageEnabled={storageEnabled}
      onUploaded={onUploaded}
      announce={announce}
    />
  );

  if (documents.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {uploadControl}
        <EmptyState
          title="No resume attached"
          description="Upload one above, or via Parse Resume — it will appear here once processed."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {uploadControl}
      <Table caption="Resume documents" columns={["File", "Uploaded"]}>
        {documents.map((doc) => (
          <ResumeRow key={doc.id} doc={doc} canDownload={canDownload} />
        ))}
      </Table>
    </div>
  );
}
