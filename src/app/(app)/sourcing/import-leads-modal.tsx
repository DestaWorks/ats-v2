"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import type { ImportLeadRow } from "@/lib/validation/lead";
import { messageForFailure } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { mapCsvToLeadRows, parseCsv } from "./lib/lead-import";
import { postImportChunk } from "./lib/lead-fetch";

/** Server chunk size (`source_lead_bulk_import` parity — legacy sent 200-row chunks). */
const CHUNK = 200;

/**
 * Lead CSV import ("Bulk Import" parity). Pick a .csv → parse client-side (quoted-cell-safe,
 * legacy alias headers, name-required) → preview the first rows + honest counts → import in
 * sequential 200-row chunks. Dedup is SERVER-side (email, else name); the final toast reports
 * `added · skipped` like the legacy alert. XLSX is not supported — export the sheet as CSV.
 */
export function ImportLeadsButton({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ImportLeadRow[]>([]);
  const [dropped, setDropped] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  function close() {
    if (importing) return;
    setOpen(false);
    setRows([]);
    setDropped(0);
    setFileName(null);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    const parsed = mapCsvToLeadRows(parseCsv(text));
    setRows(parsed.rows);
    setDropped(parsed.dropped);
    setFileName(file.name);
    if (parsed.rows.length === 0) toast.error("No importable rows found (a name is required).");
  }

  async function runImport() {
    setImporting(true);
    let added = 0;
    let skipped = 0;
    try {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const result = await postImportChunk(rows.slice(i, i + CHUNK));
        if (!result.ok) {
          toast.error(
            `Import failed at chunk ${Math.floor(i / CHUNK) + 1}: ${messageForFailure(result.failure)}`,
          );
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
        Import CSV
      </Button>
      <Modal open={open} onClose={close} title="Import leads from CSV">
        <div className="flex flex-col gap-4">
          <p className="text-xs text-gray">
            Expected columns: Candidate Name, LinkedIn URL, Job Title, Source, Client, Status, City,
            State, Phone Number, Emails, Notes. Only the name is required — duplicates are skipped
            automatically. Export XLSX sheets as CSV first.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => void onFile(e.target.files?.[0])}
            className="text-sm"
            aria-label="CSV file"
          />
          {fileName ? (
            <div className="rounded-lg border border-black/10 bg-black/[0.02] p-3 text-sm">
              <p className="font-semibold text-charcoal">
                {rows.length} row{rows.length === 1 ? "" : "s"} parsed from {fileName}
                {dropped > 0 ? ` · ${dropped} dropped (no name)` : ""}
              </p>
              <ul className="mt-1.5 flex flex-col gap-0.5 text-xs text-gray">
                {rows.slice(0, 10).map((r, i) => (
                  <li key={i}>
                    {r.name} · {r.credential ?? "—"} · {r.email ?? r.phone ?? "no contact"} ·{" "}
                    {r.status ?? "Sourced"}
                  </li>
                ))}
                {rows.length > 10 ? <li>… and {rows.length - 10} more</li> : null}
              </ul>
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button
              type="button"
              loading={importing}
              disabled={rows.length === 0}
              onClick={() => void runImport()}
            >
              Import {rows.length > 0 ? `${rows.length} leads` : ""}
            </Button>
            <Button type="button" variant="secondary" disabled={importing} onClick={close}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
