"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { ImportFormat, ImportInput, ImportReport } from "@/lib/validation/migration";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Spinner } from "@/components/ui/spinner";
import { controlClass } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import { detectFormat, importableCount } from "./lib/import-helpers";
import { ReportView } from "./report-view";

type Step = "upload" | "preview" | "commit";

const STEPS: { id: Step; label: string }[] = [
  { id: "upload", label: "Upload" },
  { id: "preview", label: "Preview" },
  { id: "commit", label: "Commit" },
];

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

interface LoadedFile {
  name: string;
  content: string;
  format: ImportFormat;
  checksum: string;
  bytes: number;
}

/** sha256 (hex) of a string via WebCrypto — the advisory prepare→commit hand-off checksum (E-7). */
async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Turn an API error envelope into a user-safe message (no PII). */
function messageForError(status: number, body: ApiErrorBody, fallback: string): string {
  if (status === 403) return "You need the bulk-import permission to run a migration.";
  if (status === 401) return "Your session expired — sign in again.";
  return body.error?.message ?? fallback;
}

/** Rough, human-friendly file size. */
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Visible stepper — announces the current step to assistive tech via `aria-current`. */
function Stepper({ current }: { current: Step }) {
  const currentIndex = STEPS.findIndex((s) => s.id === current);
  return (
    <nav aria-label="Import progress">
      <ol className="flex items-center gap-2">
        {STEPS.map((s, i) => {
          const state = i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming";
          return (
            <li key={s.id} className="flex items-center gap-2">
              <span
                aria-current={state === "current" ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold",
                  state === "current" && "bg-navy text-white",
                  state === "done" && "bg-green/15 text-green",
                  state === "upcoming" && "bg-black/5 text-gray",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-xs",
                    state === "current" && "bg-white/20",
                    state === "done" && "bg-green/20",
                    state === "upcoming" && "bg-black/10",
                  )}
                >
                  {state === "done" ? "✓" : i + 1}
                </span>
                {s.label}
                {state === "current" ? <span className="sr-only"> (current step)</span> : null}
              </span>
              {i < STEPS.length - 1 ? <span aria-hidden className="h-px w-6 bg-black/10" /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** The 3-step bulk-import wizard: Upload → Preview → Commit. */
export function MigrationWizard() {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [reading, setReading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportReport | null>(null);
  const [committed, setCommitted] = useState<ImportReport | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function resetAll() {
    setStep("upload");
    setFile(null);
    setReading(false);
    setLoading(false);
    setError(null);
    setPreview(null);
    setCommitted(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (!picked) return;
    setError(null);
    setReading(true);
    setPreview(null);
    setCommitted(null);
    try {
      const content = await picked.text();
      if (content.trim().length === 0) {
        setError("That file is empty. Choose a non-empty CSV or JSON export.");
        setFile(null);
        return;
      }
      const checksum = await sha256Hex(content);
      setFile({
        name: picked.name,
        content,
        format: detectFormat(picked.name, content),
        checksum,
        bytes: picked.size || new Blob([content]).size,
      });
    } catch {
      setError("Could not read that file. Try again with a valid CSV or JSON export.");
      setFile(null);
    } finally {
      setReading(false);
    }
  }

  function bodyFor(f: LoadedFile): ImportInput {
    return { format: f.format, content: f.content, filename: f.name, checksum: f.checksum };
  }

  async function post(url: string, f: LoadedFile): Promise<ImportReport | null> {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyFor(f)),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as ApiErrorBody;
        setError(messageForError(res.status, b, "The import request failed. Please try again."));
        return null;
      }
      return (await res.json()) as ImportReport;
    } catch {
      setError("Network error contacting the import service. Please try again.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function handlePreview() {
    if (!file) return;
    const report = await post("/api/migration/prepare", file);
    if (report) {
      setPreview(report);
      setStep("preview");
    }
  }

  async function handleCommit() {
    if (!file) return;
    const report = await post("/api/migration/commit", file);
    if (report) {
      setCommitted(report);
      setStep("commit");
    }
  }

  const willImport = preview ? importableCount(preview) : 0;

  return (
    <div className="flex flex-col gap-6">
      <Stepper current={step} />

      {error ? (
        <ErrorState title="There was a problem" message={error} onRetry={() => setError(null)} />
      ) : null}

      {/* Step 1 — Upload */}
      {step === "upload" ? (
        <Card className="flex flex-col gap-4 p-6">
          <div className="flex flex-col gap-1">
            <label htmlFor="import-file" className="text-sm font-medium text-charcoal">
              Legacy candidate export (CSV or JSON)
            </label>
            <input
              ref={fileInputRef}
              id="import-file"
              type="file"
              accept=".csv,.json"
              onChange={onFileChange}
              className={cn(
                controlClass,
                "px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:opacity-90",
              )}
            />
            <p className="text-xs text-gray">
              The file is read in your browser and sent for a dry-run preview — nothing is written
              until you commit.
            </p>
          </div>

          {reading ? (
            <p className="flex items-center gap-2 text-sm text-gray">
              <Spinner className="h-4 w-4" /> Reading file…
            </p>
          ) : null}

          {file ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-black/5 bg-black/[0.02] px-3 py-2 text-sm">
              <Badge tone="navy" size="sm">
                {file.format.toUpperCase()}
              </Badge>
              <span className="font-medium text-charcoal">{file.name}</span>
              <span className="text-xs text-gray">
                {formatBytes(file.bytes)} · ~{file.content.split(/\r?\n/).length} lines
              </span>
            </div>
          ) : null}

          <div>
            <Button
              type="button"
              onClick={handlePreview}
              loading={loading}
              disabled={!file || reading}
            >
              Preview import
            </Button>
          </div>
        </Card>
      ) : null}

      {/* Step 2 — Preview */}
      {step === "preview" && preview ? (
        <div className="flex flex-col gap-4">
          <div
            role="status"
            className="rounded-xl border border-navy/20 bg-navy/5 px-4 py-3 text-sm text-charcoal"
          >
            <span className="font-semibold text-navy">Nothing has been written yet.</span> This is a
            dry-run preview of {file?.name ?? "the export"}. Review the report, then commit.
          </div>

          <ReportView report={preview} />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setStep("upload")}
              disabled={loading}
            >
              ← Back
            </Button>
            <Button
              type="button"
              variant="success"
              onClick={handleCommit}
              loading={loading}
              disabled={willImport === 0 || loading}
            >
              Commit {willImport} candidate{willImport === 1 ? "" : "s"}
            </Button>
            {willImport === 0 ? (
              <span className="text-xs text-gray">
                Nothing importable — every row errored or was skipped.
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Step 3 — Commit + result */}
      {step === "commit" && committed ? (
        <div className="flex flex-col gap-4">
          <div
            role="status"
            className="flex flex-col gap-1 rounded-xl border border-green/30 bg-green/5 px-4 py-3 text-sm text-charcoal"
          >
            <span className="font-semibold text-green">Import committed.</span>
            <span>
              This wrote {committed.counts.added + committed.counts.updated} candidate
              {committed.counts.added + committed.counts.updated === 1 ? "" : "s"} to the database (
              {committed.counts.added} added, {committed.counts.updated} updated). Re-running is
              safe: candidates are matched by legacy id (nothing duplicates), and a re-run refreshes
              profile fields from the Sheet while preserving each candidate&apos;s pipeline stage
              and tags.
            </span>
          </div>

          <ReportView report={committed} />

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/pipeline"
              className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              View imported candidates →
            </Link>
            <Button type="button" variant="secondary" onClick={resetAll}>
              Import another file
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
