"use client";

import { useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import type { ImportLeadRow } from "@/lib/validation/lead";
import { messageForFailure } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { mapCsvToLeadRows, parseCsv } from "./lib/lead-import";
import { postImportChunk } from "./lib/lead-fetch";

/** Server chunk size (`source_lead_bulk_import` parity — legacy sent 200-row chunks). */
const CHUNK = 200;

/** The headers the mapper understands, in display order ("Name" is the only REQUIRED one). */
const EXPECTED_COLUMNS = [
  "Candidate Name",
  "Job Title",
  "Emails",
  "Phone Number",
  "LinkedIn URL",
  "Source",
  "Client",
  "Status",
  "State",
  "City",
  "Notes",
];

const PREVIEW_ROWS = 5;

/**
 * Lead CSV import ("Bulk Import" parity). A drag-and-drop zone (or click to browse) → parse
 * client-side (quoted-cell-safe, legacy alias headers, name-required) → a parsed-file summary
 * with a capped preview → import in sequential 200-row chunks. Dedup is SERVER-side (email,
 * else name); the final toast reports `added · skipped` like the legacy alert. XLSX is not
 * supported — export the sheet as CSV.
 */
export function ImportLeadsButton({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ImportLeadRow[]>([]);
  const [dropped, setDropped] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  function reset() {
    setRows([]);
    setDropped(0);
    setFileName(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function close() {
    if (importing) return;
    setOpen(false);
    setDragging(false);
    reset();
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
      toast.error("That's not a CSV — export the sheet as CSV first.");
      return;
    }
    const text = await file.text();
    const parsed = mapCsvToLeadRows(parseCsv(text));
    setRows(parsed.rows);
    setDropped(parsed.dropped);
    setFileName(file.name);
    if (parsed.rows.length === 0) toast.error("No importable rows found (a name is required).");
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    void onFile(e.dataTransfer.files?.[0]);
  }

  async function runImport() {
    setImporting(true);
    let added = 0;
    let skipped = 0;
    try {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const result = await postImportChunk(rows.slice(i, i + CHUNK));
        if (!result.ok) {
          // Name the first offending row/field ("rows.6.status: Invalid…") — a bare
          // "Validation failed" gives the user nothing to fix.
          const issue = result.failure.issues[0];
          toast.error(`Import failed at chunk ${Math.floor(i / CHUNK) + 1}`, {
            description: issue
              ? `${issue.path}: ${issue.message}`
              : messageForFailure(result.failure),
          });
          return;
        }
        added += result.data.added;
        skipped += result.data.skipped;
      }
      toast.success(`Import done: ${added} added · ${skipped} skipped (duplicates)`);
      close();
      onImported();
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Bulk Import
      </Button>
      <Modal open={open} onClose={close} title="Import leads from CSV">
        <div className="flex flex-col gap-4">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => void onFile(e.target.files?.[0])}
            className="sr-only"
            aria-label="CSV file"
          />

          {!fileName ? (
            <>
              {/* The drop zone — click to browse, or drag a CSV in. */}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 transition",
                  "focus-visible:ring-2 focus-visible:ring-navy focus-visible:outline-none",
                  dragging
                    ? "border-navy bg-navy/5"
                    : "border-black/15 bg-black/[0.02] hover:border-navy/40 hover:bg-navy/[0.03]",
                )}
              >
                <span
                  aria-hidden
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-navy/10 text-navy"
                >
                  <svg
                    viewBox="0 0 20 20"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M10 13V4M6 8l4-4 4 4M3.5 13.5v2a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5v-2" />
                  </svg>
                </span>
                <span className="text-sm font-semibold text-charcoal">
                  {dragging ? "Drop the CSV here" : "Choose a CSV file or drag it here"}
                </span>
                <span className="text-xs text-gray">
                  Export XLSX sheets as CSV first · duplicates are skipped automatically
                </span>
              </button>

              {/* Understood columns — Name is the only required one. */}
              <div>
                <p className="text-[11px] font-bold tracking-[0.08em] text-gray uppercase">
                  Recognized columns
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {EXPECTED_COLUMNS.map((c, i) => (
                    <Badge key={c} tone={i === 0 ? "navy" : "neutral"} size="sm">
                      {c}
                      {i === 0 ? " · required" : ""}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Parsed-file summary. */}
              <div className="flex items-center justify-between gap-3 rounded-xl border border-green/30 bg-green/5 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green/15 text-green"
                  >
                    <svg
                      viewBox="0 0 20 20"
                      className="h-4.5 w-4.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m4.5 10.5 3.5 3.5 7.5-8" />
                    </svg>
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-charcoal">{fileName}</p>
                    <p className="text-xs text-gray">
                      {rows.length} lead{rows.length === 1 ? "" : "s"} ready
                      {dropped > 0
                        ? ` · ${dropped} row${dropped === 1 ? "" : "s"} dropped (no name)`
                        : ""}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={importing}
                  onClick={reset}
                >
                  Change file
                </Button>
              </div>

              {/* Capped preview — enough to sanity-check the mapping, never a wall. */}
              {rows.length > 0 ? (
                <ul className="divide-y divide-black/5 overflow-hidden rounded-xl border border-black/5">
                  {rows.slice(0, PREVIEW_ROWS).map((r, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between gap-3 bg-white px-3 py-2"
                    >
                      <span className="min-w-0">
                        <span className="text-sm font-semibold text-charcoal">{r.name}</span>
                        <span className="block truncate text-xs text-gray">
                          {[r.credential, r.email ?? r.phone ?? "no contact", r.clientName]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <Badge tone="neutral" size="sm" className="shrink-0">
                        {r.status ?? "Sourced"}
                      </Badge>
                    </li>
                  ))}
                  {rows.length > PREVIEW_ROWS ? (
                    <li className="bg-white px-3 py-2 text-xs text-gray">
                      + {rows.length - PREVIEW_ROWS} more lead
                      {rows.length - PREVIEW_ROWS === 1 ? "" : "s"}
                    </li>
                  ) : null}
                </ul>
              ) : null}
            </>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-black/5 pt-4">
            <Button type="button" variant="secondary" disabled={importing} onClick={close}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="success"
              loading={importing}
              disabled={rows.length === 0}
              onClick={() => void runImport()}
            >
              {importing
                ? "Importing…"
                : rows.length > 0
                  ? `Import ${rows.length} lead${rows.length === 1 ? "" : "s"}`
                  : "Import"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
