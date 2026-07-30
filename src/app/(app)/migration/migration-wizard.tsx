"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type {
  ImportFormat,
  ImportInput,
  ImportReport,
  ImportResume,
} from "@/lib/validation/migration";
import { MAX_IMPORT_RESUMES } from "@/lib/validation/migration";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils/cn";
import { extractPdfText } from "../resume/lib/pdf-extract";
import { detectFormat, importableCount } from "./lib/import-helpers";
import { ReportView } from "./report-view";

/** Combined resume-text payload cap (chars, ≈bytes for this purpose) — conservative, safely
 *  under Vercel's default serverless body-size limit (Wave 1.3 backlog, the "Indrasur" flow). */
const MAX_RESUME_PAYLOAD_CHARS = 8_000_000;

type Step = "upload" | "preview" | "commit";

const STEPS: { id: Step; label: string }[] = [
  { id: "upload", label: "Upload" },
  { id: "preview", label: "Match Preview" },
  { id: "commit", label: "Results" },
];

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

interface LoadedFile {
  name: string;
  content: string;
  format: ImportFormat;
  checksum: string;
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

/** Drag-and-drop file picker — legacy parity (`legacy/index.html` ~line 1509-1511, 1517-1521):
 *  idle (gray dashed border, icon + label + hint) → loading (a spinner + status, e.g. "Extracting…")
 *  → loaded (border/background turn green, icon replaced by a ✓, filename in bold green, a
 *  "click or drop to replace" subtitle). Click OR drop both fire `onFiles`; while loading, the box
 *  stops accepting new drops/clicks. */
function DropZone({
  id,
  icon,
  label,
  hint,
  accept,
  inputRef,
  onFiles,
  loading = false,
  loadingTitle = "Reading…",
  loadingSubtitle,
  loaded,
}: {
  id: string;
  icon: string;
  label: string;
  hint: string;
  accept: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFiles: (files: FileList) => void;
  loading?: boolean;
  loadingTitle?: string;
  loadingSubtitle?: string;
  loaded?: { title: string; subtitle: string } | null;
}) {
  const [dragOver, setDragOver] = useState(false);
  const isLoaded = !loading && !!loaded;
  return (
    <div
      role="button"
      aria-busy={loading}
      tabIndex={loading ? -1 : 0}
      onClick={() => {
        if (!loading) inputRef.current?.click();
      }}
      onKeyDown={(e) => {
        if (!loading && (e.key === "Enter" || e.key === " ")) inputRef.current?.click();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!loading) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (!loading && e.dataTransfer.files.length > 0) onFiles(e.dataTransfer.files);
      }}
      className={cn(
        "flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-6 py-10 text-center transition",
        loading && "cursor-wait border-black/10 bg-black/[0.015]",
        !loading &&
          !isLoaded &&
          "cursor-pointer border-black/10 bg-black/[0.015] hover:border-black/20",
        isLoaded && "cursor-pointer border-green bg-green/10",
        dragOver && !loading && "border-navy bg-navy/5",
      )}
    >
      {loading ? (
        <>
          <Spinner className="h-6 w-6" />
          <p className="text-sm font-semibold text-navy">{loadingTitle}</p>
          {loadingSubtitle ? <p className="text-xs text-gray">{loadingSubtitle}</p> : null}
        </>
      ) : isLoaded ? (
        <>
          <span aria-hidden className="text-xl text-green">
            ✓
          </span>
          <p className="text-sm font-semibold text-green">{loaded.title}</p>
          <p className="text-xs text-gray">{loaded.subtitle}</p>
        </>
      ) : (
        <>
          <span aria-hidden className="text-3xl">
            {icon}
          </span>
          <p className="text-sm font-semibold text-charcoal">{label}</p>
          <p className="text-xs text-gray">{hint}</p>
        </>
      )}
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        disabled={loading}
        onChange={(e) => {
          if (e.target.files) onFiles(e.target.files);
        }}
        className="hidden"
      />
    </div>
  );
}

/** Visible stepper — matches legacy's step indicator exactly (`legacy/index.html` ~line 1497-1500):
 *  flex row, 8px gaps, each segment `flex:1`, current step filled navy, done steps filled green with
 *  a "✓ " prefix, upcoming steps flat light gray. Announces the current step via `aria-current`. */
function Stepper({ current }: { current: Step }) {
  const currentIndex = STEPS.findIndex((s) => s.id === current);
  return (
    <nav aria-label="Import progress">
      <ol className="flex items-center gap-2">
        {STEPS.map((s, i) => {
          const state = i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming";
          return (
            <li key={s.id} className="flex-1">
              <span
                aria-current={state === "current" ? "step" : undefined}
                className={cn(
                  "block rounded-md px-3 py-2 text-center text-[11px] font-semibold",
                  state === "current" && "bg-navy text-white",
                  state === "done" && "bg-green text-white",
                  state === "upcoming" && "bg-black/5 text-gray",
                )}
              >
                {state === "done" ? "✓ " : ""}
                {i + 1}. {s.label}
                {state === "current" ? <span className="sr-only"> (current step)</span> : null}
              </span>
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
  // Wave 1.3 backlog (Indrasur bulk-resume flow) — optional, independent of the CSV/JSON above.
  const [resumeZipName, setResumeZipName] = useState<string | null>(null);
  const [resumeZipBytes, setResumeZipBytes] = useState(0);
  const [resumes, setResumes] = useState<ImportResume[] | null>(null);
  const [zipReading, setZipReading] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);
  const [extractWithAi, setExtractWithAi] = useState(false);
  const resumeInputRef = useRef<HTMLInputElement>(null);

  function resetAll() {
    setStep("upload");
    setFile(null);
    setReading(false);
    setLoading(false);
    setError(null);
    setPreview(null);
    setCommitted(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setResumeZipName(null);
    setResumeZipBytes(0);
    setResumes(null);
    setZipReading(false);
    setZipError(null);
    setExtractWithAi(false);
    if (resumeInputRef.current) resumeInputRef.current.value = "";
  }

  /** Unzip client-side + pdf.js-extract each PDF entry — same client-only path as the
   *  single-resume flow (`resume/lib/pdf-extract.ts`), never a binary upload to the server. */
  async function onResumeZipFiles(files: FileList) {
    const picked = files[0];
    if (!picked) return;
    setZipError(null);
    setResumes(null);
    setResumeZipName(picked.name);
    setResumeZipBytes(picked.size);
    setZipReading(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(picked);
      const entries = Object.values(zip.files).filter((f) => !f.dir && /\.pdf$/i.test(f.name));
      if (entries.length === 0) {
        setZipError("No PDF files found in that ZIP.");
        return;
      }
      if (entries.length > MAX_IMPORT_RESUMES) {
        setZipError(
          `That ZIP has ${entries.length} resumes — max ${MAX_IMPORT_RESUMES} per batch. Split it up.`,
        );
        return;
      }
      const loaded: ImportResume[] = [];
      let totalChars = 0;
      for (const entry of entries) {
        const blob = await entry.async("blob");
        const pdfFile = new File([blob], entry.name, { type: "application/pdf" });
        const text = await extractPdfText(pdfFile);
        totalChars += text.length;
        if (totalChars > MAX_RESUME_PAYLOAD_CHARS) {
          setZipError("Too many/large resumes for one batch — split the ZIP into smaller batches.");
          setResumes(null);
          return;
        }
        const basename = entry.name.split("/").pop() ?? entry.name;
        const filenamePrefix = basename.split("_")[0]!.trim().toLowerCase();
        loaded.push({ filenamePrefix, originalFilename: basename, text });
      }
      setResumes(loaded);
    } catch {
      setZipError("Could not read that ZIP. Try again with a valid file.");
      setResumes(null);
    } finally {
      setZipReading(false);
    }
  }

  async function onCsvFiles(files: FileList) {
    const picked = files[0];
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
      });
    } catch {
      setError("Could not read that file. Try again with a valid CSV or JSON export.");
      setFile(null);
    } finally {
      setReading(false);
    }
  }

  function bodyFor(f: LoadedFile): ImportInput {
    return {
      format: f.format,
      content: f.content,
      filename: f.name,
      checksum: f.checksum,
      resumes: resumes && resumes.length > 0 ? resumes : undefined,
      extractWithAi: resumes && resumes.length > 0 ? extractWithAi : undefined,
    };
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
        <Card className="flex flex-col gap-6 p-6">
          <div className="flex flex-col gap-2">
            <label htmlFor="import-file" className="text-sm font-semibold text-charcoal">
              1. CSV file (raw candidate data)
            </label>
            <DropZone
              id="import-file"
              icon="📄"
              label="Drop CSV or JSON here or click to browse"
              hint="Legacy candidate export · .csv or .json"
              accept=".csv,.json"
              inputRef={fileInputRef}
              onFiles={(files) => void onCsvFiles(files)}
              loading={reading}
              loadingTitle="Reading file…"
              loaded={
                file
                  ? {
                      title: file.name,
                      subtitle: `${file.content.length.toLocaleString()} chars · click or drop to replace`,
                    }
                  : null
              }
            />
            <p className="text-xs text-gray">
              The file is read in your browser and sent for a dry-run preview — nothing is written
              until you commit.
            </p>
          </div>

          {/* Wave 1.3 backlog (Indrasur bulk-resume flow) — optional, independent of the CSV. */}
          <div className="flex flex-col gap-2 border-t border-black/5 pt-6">
            <label htmlFor="import-resumes" className="text-sm font-semibold text-charcoal">
              2. Resume ZIP (filename prefix = candidate name)
            </label>
            <DropZone
              id="import-resumes"
              icon="📦"
              label="Drop ZIP here or click to browse"
              hint="Filename prefix must match Candidate name · .zip"
              accept=".zip"
              inputRef={resumeInputRef}
              onFiles={(files) => void onResumeZipFiles(files)}
              loading={zipReading}
              loadingTitle="Extracting…"
              loadingSubtitle={`${resumeZipName ?? ""} · this runs locally in your browser`}
              loaded={
                resumes && resumes.length > 0
                  ? {
                      title: resumeZipName ?? "",
                      subtitle: `${resumes.length} resume${resumes.length === 1 ? "" : "s"} extracted · ${Math.round(resumeZipBytes / 1024).toLocaleString()} KB · click or drop to replace`,
                    }
                  : null
              }
            />
            <p className="text-xs text-gray">
              PDF resumes named like <code>CandidateName_anything.pdf</code> — matched to rows by
              name. A row with no matching resume still imports normally; unmatched/ambiguous
              resumes are called out in the report, never silently dropped.
            </p>
            {zipError ? <p className="text-sm text-red">{zipError}</p> : null}
            {resumes && resumes.length > 0 ? (
              <label className="flex items-center gap-2 text-sm text-charcoal">
                <input
                  type="checkbox"
                  checked={extractWithAi}
                  onChange={(e) => setExtractWithAi(e.target.checked)}
                  className="h-4 w-4 accent-navy"
                />
                Extract resume data with AI on commit ({resumes.length} paid LLM call
                {resumes.length === 1 ? "" : "s"})
              </label>
            ) : null}
          </div>

          <div>
            <Button
              type="button"
              onClick={handlePreview}
              loading={loading}
              disabled={!file || reading}
            >
              Continue to Match Preview →
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

          <ReportView
            report={preview}
            csvContent={file?.content}
            csvFormat={file?.format}
            resumes={resumes ?? undefined}
          />

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

          <ReportView
            report={committed}
            csvContent={file?.content}
            csvFormat={file?.format}
            resumes={resumes ?? undefined}
          />

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
