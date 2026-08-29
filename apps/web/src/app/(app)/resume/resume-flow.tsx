"use client";

import { useState } from "react";
import type { ResumeVariant } from "@destaworks/domain/constants/documents";
import { RESUME_VARIANT_LABELS } from "@destaworks/domain/constants/documents";
import type { PostResumeSaveResponse } from "@/app/api/resume/save/route";
import type {
  ResumeData,
  ResumeMatch,
  SaveResumeInput,
  ExtractResumeResponse as PostResumeExtractResponse,
} from "@destaworks/contracts/validation/resume";
import { Spinner } from "@destaworks/ui/spinner";
import { ErrorState } from "@destaworks/ui/error-state";
import { Button } from "@destaworks/ui/button";
import { VariantPicker } from "./variant-picker";
import { UploadZone } from "./upload-zone";
import { ReviewForm } from "./review/review-form";
import { BrandedResume } from "./branded-resume";
import { capResumeText, extractPdfText } from "./lib/pdf-extract";
import { messageForFailure, postJson, type ApiFailure } from "@/lib/api/client";
import { uploadToStorage } from "@/lib/api/upload";

type Step = "pick" | "upload" | "extracting" | "review" | "saved";

/**
 * The resume flow's own wording for the codes AI extraction can fail with. Everything else defers
 * to the shared `messageForFailure`, so this stays a list of what is special here rather than a
 * second copy of the general mapping.
 */
function messageForError(failure: ApiFailure, fallback: string): string {
  switch (failure.code) {
    case "FEATURE_DISABLED":
      return "Resume extraction isn't configured on this environment. Ask an administrator to add an AI provider key.";
    case "RATE_LIMITED":
      return "The AI service is busy right now — wait a moment and try again.";
    case "EXTRACTION_FAILED":
      return "The resume couldn't be extracted. Try again, or paste the text manually.";
    case "BAD_REQUEST":
      return failure.message || fallback;
    case "NETWORK":
      return messageForFailure(failure);
    default:
      return fallback;
  }
}

/** Client orchestrator for the parse-resume flow: pick → upload → extract → review → saved. */
export function ResumeFlow({
  recruiterName,
  resumeExtractionEnabled,
  resumeStorageEnabled,
}: {
  recruiterName: string;
  resumeExtractionEnabled: boolean;
  /** Wave 6 — when true, the original file bytes are uploaded to Supabase Storage on save (in
   *  addition to the always-persisted extracted text); when false, save behaves exactly as
   *  before (text-only, no bytes). */
  resumeStorageEnabled: boolean;
}) {
  const [step, setStep] = useState<Step>("pick");
  const [variant, setVariant] = useState<ResumeVariant | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  // The raw file, kept alive through extracting/review/save purely for the (optional) Storage
  // upload — pdf.js only ever needed the text, so nothing else in this flow reads it.
  const [file, setFile] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [fileText, setFileText] = useState("");
  const [extractedText, setExtractedText] = useState("");
  const [result, setResult] = useState<PostResumeExtractResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [savedName, setSavedName] = useState<string | null>(null);
  // The reviewed data as saved — feeds the branded resume render on the saved step.
  const [savedData, setSavedData] = useState<ResumeData | null>(null);
  const [error, setError] = useState<string | null>(null);

  function resetToPick() {
    setStep("pick");
    setVariant(null);
    setFileName(null);
    setFile(null);
    setFileText("");
    setExtractedText("");
    setResult(null);
    setSavedName(null);
    setSavedData(null);
    setError(null);
  }

  function chooseVariant(next: ResumeVariant) {
    setVariant(next);
    setError(null);
    setStep("upload");
  }

  async function handleFile(picked: File) {
    setError(null);
    setFileName(picked.name);
    setFile(picked);
    setReading(true);
    setFileText("");
    try {
      const isPdf = picked.type === "application/pdf" || /\.pdf$/i.test(picked.name);
      const text = isPdf ? await extractPdfText(picked) : capResumeText(await picked.text());
      setFileText(text);
    } catch {
      setError("Could not read that file. Try a different PDF, or paste the text instead.");
      setFileName(null);
      setFile(null);
    } finally {
      setReading(false);
    }
  }

  async function handleExtract(pastedText: string) {
    if (!variant) return;
    const text = pastedText.trim().length > 50 ? pastedText.trim() : fileText;
    if (!text || text.trim().length <= 50) {
      setError("Upload a PDF or paste at least 50 characters of resume text first.");
      return;
    }
    setStep("extracting");
    setError(null);
    const result = await postJson<PostResumeExtractResponse>("/api/resume/extract", {
      variant,
      text,
    });
    if (!result.ok) {
      setError(messageForError(result.failure, "Extraction failed. Please try again."));
      setStep("upload");
      return;
    }
    setExtractedText(text);
    setResult(result.data);
    setStep("review");
  }

  /** Best-effort: uploads the raw file straight to Storage and returns its key, or `undefined` on
   *  any failure/when disabled — a Storage hiccup must never block saving the candidate, since the
   *  extracted text is always the source of truth. */
  async function tryUploadToStorage(originalFilename: string, mimeType: string) {
    if (!resumeStorageEnabled || !file) return undefined;
    const result = await uploadToStorage({ filename: originalFilename, mimeType, body: file });
    return result.ok ? result.storageKey : undefined;
  }

  async function handleSave(data: ResumeData, confirmedCandidateId: string | undefined) {
    if (!variant) return;
    setSubmitting(true);
    setError(null);
    const originalFilename = fileName ?? "resume.txt";
    const mimeType = fileName?.toLowerCase().endsWith(".pdf") ? "application/pdf" : "text/plain";
    const storageKey = await tryUploadToStorage(originalFilename, mimeType);
    const payload: SaveResumeInput = {
      variant,
      data: data as unknown as Record<string, unknown>,
      originalFilename,
      mimeType,
      extractedText,
      confirmedCandidateId,
      storageKey,
    };
    try {
      const result = await postJson<PostResumeSaveResponse>("/api/resume/save", payload);
      if (!result.ok) {
        setError(
          messageForError(result.failure, "Could not save this candidate. Please try again."),
        );
        return;
      }
      setSavedName(result.data.candidate.name);
      setSavedData(data);
      setStep("saved");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <ErrorState title="There was a problem" message={error} onRetry={() => setError(null)} />
      ) : null}

      {step === "pick" ? <VariantPicker value={variant} onChange={chooseVariant} /> : null}

      {step === "upload" && variant ? (
        <UploadZone
          variant={variant}
          fileName={fileName}
          reading={reading}
          extractionEnabled={resumeExtractionEnabled}
          onFile={handleFile}
          onExtract={handleExtract}
          onChangeRole={resetToPick}
        />
      ) : null}

      {step === "extracting" && variant ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-black/10 bg-white shadow-card p-12 text-center">
          <Spinner className="h-8 w-8" />
          <p className="text-sm font-semibold text-charcoal">
            Building the {RESUME_VARIANT_LABELS[variant].toLowerCase()} profile…
          </p>
          <p className="text-xs text-gray">This usually takes about 10–25 seconds.</p>
        </div>
      ) : null}

      {step === "review" && variant && result ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-gray">
              Extracted by AI — review and fact-check before saving.
            </p>
            <Button type="button" variant="ghost" size="xs" onClick={() => setStep("upload")}>
              ← Re-upload
            </Button>
          </div>
          <ReviewForm
            variant={variant}
            data={result.data as ResumeData}
            match={result.match as ResumeMatch}
            submitting={submitting}
            onSave={handleSave}
          />
        </div>
      ) : null}

      {step === "saved" && variant && savedData ? (
        <div className="flex flex-col gap-4">
          {/* Success bar + output actions (never printed). */}
          <div className="no-print flex flex-wrap items-center gap-2 rounded-xl border border-green/30 bg-green/5 px-4 py-3">
            <p className="text-sm font-semibold text-green">✓ {savedName ?? "Candidate"} saved</p>
            <p className="text-xs text-gray">Added to the pipeline by {recruiterName}.</p>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" onClick={() => window.print()}>
                Print / Save PDF
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  const subject = `Candidate profile — ${savedData.name || savedName || ""}`;
                  const body =
                    `Hi,\n\nSharing ${savedData.name || "a candidate"}` +
                    `${savedData.headerRole ? ` — ${savedData.headerRole}` : ""}.\n` +
                    `The profile is attached.\n\n${recruiterName}\nDesta Works`;
                  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                }}
              >
                Email…
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={resetToPick}>
                Convert another
              </Button>
            </div>
            <p className="w-full text-[11px] text-gray">
              Email opens a compose draft — use Print / Save PDF first, then attach the PDF.
            </p>
          </div>

          <BrandedResume variant={variant} data={savedData} />
        </div>
      ) : null}
    </div>
  );
}
