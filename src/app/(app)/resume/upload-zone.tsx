"use client";

import { useId, useRef, useState } from "react";
import { RESUME_VARIANT_LABELS, type ResumeVariant } from "@/lib/constants/documents";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils/cn";

/**
 * Upload step (design §7): drag-drop / keyboard-accessible file input for a PDF, plus a
 * paste-text fallback. On a PDF the parent runs client-side pdf.js extraction; on pasted
 * text it uses the text directly. The Extract action is disabled (with a hint) when résumé
 * extraction is not configured (`resumeExtractionEnabled === false`, design §7 / S-6).
 */
export function UploadZone({
  variant,
  fileName,
  reading,
  extractionEnabled,
  onFile,
  onExtract,
  onChangeRole,
}: {
  variant: ResumeVariant;
  fileName: string | null;
  reading: boolean;
  extractionEnabled: boolean;
  onFile: (file: File) => void;
  onExtract: (pastedText: string) => void;
  onChangeRole: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [pasted, setPasted] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputId = useId();
  const pasteId = useId();

  const hasSomething = Boolean(fileName) || pasted.trim().length > 50;
  const canExtract = extractionEnabled && !reading && hasSomething;

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) onFile(file);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-charcoal">
          Step 2 — Upload résumé for{" "}
          <span className="text-navy">{RESUME_VARIANT_LABELS[variant]}</span>
        </p>
        <button
          type="button"
          onClick={onChangeRole}
          className="rounded-md px-2 py-1 text-xs font-medium text-gray transition hover:bg-black/5"
        >
          ← Change role
        </button>
      </div>

      {/* Drop zone wraps a real, focusable file input (keyboard + SR accessible). */}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragging(false);
        }}
        onDrop={onDrop}
        className={cn(
          "rounded-xl border-2 border-dashed p-8 text-center transition",
          dragging ? "border-navy bg-navy/5" : "border-black/15 bg-white",
        )}
      >
        {reading ? (
          <div className="flex flex-col items-center gap-2">
            <Spinner />
            <p className="text-sm text-navy">Reading {fileName}…</p>
          </div>
        ) : fileName ? (
          <div className="flex flex-col items-center gap-1">
            <p className="text-sm font-semibold text-green">✓ {fileName} loaded</p>
            <p className="text-xs text-gray">Click “Extract &amp; Convert” below.</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <span className="text-3xl" aria-hidden>
              📄
            </span>
            <label
              htmlFor={fileInputId}
              className="cursor-pointer text-sm font-semibold text-navy hover:underline focus-within:underline"
            >
              Drag &amp; drop a résumé, or browse
            </label>
            <p className="text-xs text-gray">PDF preferred</p>
          </div>
        )}
        <input
          ref={inputRef}
          id={fileInputId}
          type="file"
          accept=".pdf,.txt"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
            event.target.value = "";
          }}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={pasteId} className="text-sm font-medium text-charcoal">
          Or paste résumé text
        </label>
        <textarea
          id={pasteId}
          rows={5}
          value={pasted}
          onChange={(event) => setPasted(event.target.value)}
          placeholder="Paste the candidate's résumé text here (only if no PDF available)…"
          className="resize-y rounded-md border border-black/15 px-3 py-2 font-mono text-xs focus:ring-2 focus:ring-navy focus:outline-none"
        />
        {pasted.trim().length > 0 ? (
          <p className="text-xs text-gray">{pasted.length} characters</p>
        ) : null}
      </div>

      {!extractionEnabled ? (
        <p role="status" className="rounded-md bg-orange/10 px-3 py-2 text-xs text-orange">
          Résumé extraction isn&apos;t configured on this environment, so the AI step is
          unavailable. You can still upload and read the résumé; ask an administrator to add an AI
          provider key to enable conversion.
        </p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={!canExtract}
          onClick={() => onExtract(pasted)}
          className="rounded-md bg-navy px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
        >
          Extract &amp; Convert →
        </button>
      </div>
    </div>
  );
}
