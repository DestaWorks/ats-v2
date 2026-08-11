"use client";

import { useEffect, useMemo, useState } from "react";
import type { ImportFormat, ImportReport, ImportResume } from "@/lib/validation/migration";
import { Button } from "@/components/ui/button";
import { findRawRow } from "./lib/inspect-row";

/**
 * Legacy parity — "click any row to inspect the CSV data and preview the matched resume before
 * committing." Read-only (no per-row skip toggle — that's a separate, not-yet-built feature).
 * Shows the raw CSV/JSON row (display-only, via `findRawRow`) and the matched résumé's already-
 * extracted TEXT (never a PDF render — this app never stores résumé binaries, see Wave 1.2).
 */
export function RowInspectModal({
  report,
  startIndex,
  csvContent,
  csvFormat,
  resumes,
  onClose,
}: {
  report: ImportReport;
  startIndex: number;
  csvContent: string;
  csvFormat: ImportFormat;
  resumes: ImportResume[];
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const row = report.rows[index]!;
  const atStart = index === 0;
  const atEnd = index === report.rows.length - 1;

  const raw = useMemo(
    () => findRawRow(csvContent, csvFormat, row.legacyId),
    [csvContent, csvFormat, row.legacyId],
  );
  const matchedResume =
    row.resumeMatch === "matched" && row.resumeFilename
      ? (resumes.find((r) => r.originalFilename === row.resumeFilename) ?? null)
      : null;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, report.rows.length - 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, report.rows.length]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Inspect ${row.name} before commit`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-black/5 px-6 py-4">
          <div>
            <p className="text-xs font-semibold tracking-wide text-gray uppercase">
              Row {index + 1} of {report.rows.length} · Inspect before commit
            </p>
            <h2 className="text-xl font-bold text-charcoal">{row.name}</h2>
            <p className="text-xs text-gray">
              Legacy ID {row.legacyId}
              {raw?.Email ? ` · ${raw.Email}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIndex((i) => Math.max(i - 1, 0))}
              disabled={atStart}
            >
              ← Prev
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIndex((i) => Math.min(i + 1, report.rows.length - 1))}
              disabled={atEnd}
            >
              Next →
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>

        <div className="grid flex-1 grid-cols-1 overflow-y-auto sm:grid-cols-2">
          <div className="flex flex-col gap-3 border-b border-black/5 p-6 sm:border-r sm:border-b-0">
            <h3 className="text-xs font-bold tracking-wide text-navy uppercase">CSV data</h3>
            {raw && Object.keys(raw).length > 0 ? (
              <dl className="flex flex-col gap-2.5 text-sm">
                {Object.entries(raw).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[10px] font-semibold tracking-wide text-gray uppercase">
                      {k}
                    </dt>
                    <dd className="text-charcoal">{v}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-gray">
                Couldn&apos;t locate this row in the uploaded file.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3 p-6">
            <h3 className="text-xs font-bold tracking-wide text-navy uppercase">Resume preview</h3>
            {matchedResume ? (
              <>
                <p className="text-xs font-medium text-gray">{matchedResume.originalFilename}</p>
                <pre className="max-h-[50vh] overflow-y-auto rounded-lg bg-black/[0.02] p-3 text-xs whitespace-pre-wrap text-charcoal">
                  {matchedResume.text}
                </pre>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center">
                {row.resumeMatch === "ambiguous" ? (
                  <p className="rounded-lg bg-amber/10 p-3 text-sm text-charcoal">
                    Multiple resumes matched this candidate&apos;s name — none was attached to avoid
                    guessing wrong. Rename the files so only one matches, then re-upload.
                  </p>
                ) : (
                  <p className="rounded-lg bg-black/[0.02] p-3 text-sm text-gray">
                    No resume matched for this candidate. It still imports normally — attach one
                    manually afterward via the candidate&apos;s own resume upload.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
