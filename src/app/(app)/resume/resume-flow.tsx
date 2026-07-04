"use client";

import { useState } from "react";
import type { ResumeVariant } from "@/lib/constants/documents";
import { RESUME_VARIANT_LABELS } from "@/lib/constants/documents";
import type {
  ExtractResumeResponse,
  ResumeData,
  ResumeMatch,
  SaveResumeInput,
} from "@/lib/validation/resume";
import { Spinner } from "@/components/ui/spinner";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { VariantPicker } from "./variant-picker";
import { UploadZone } from "./upload-zone";
import { ReviewForm } from "./review/review-form";
import { capResumeText, extractPdfText } from "./lib/pdf-extract";
import type { ApiErrorBody } from "@/lib/api/client";

type Step = "pick" | "upload" | "extracting" | "review" | "saved";

/** Turn an API error envelope into a user-safe message (no PII, no raw provider text). */
function messageForError(body: ApiErrorBody, fallback: string): string {
  const code = body.error?.code;
  switch (code) {
    case "FEATURE_DISABLED":
      return "Résumé extraction isn't configured on this environment. Ask an administrator to add an AI provider key.";
    case "RATE_LIMITED":
      return "The AI service is busy right now — wait a moment and try again.";
    case "EXTRACTION_FAILED":
      return "The résumé couldn't be extracted. Try again, or paste the text manually.";
    case "BAD_REQUEST":
      return body.error?.message ?? fallback;
    default:
      return fallback;
  }
}

/** Client orchestrator for the parse-résumé flow: pick → upload → extract → review → saved. */
export function ResumeFlow({
  recruiterName,
  resumeExtractionEnabled,
}: {
  recruiterName: string;
  resumeExtractionEnabled: boolean;
}) {
  const [step, setStep] = useState<Step>("pick");
  const [variant, setVariant] = useState<ResumeVariant | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [fileText, setFileText] = useState("");
  const [extractedText, setExtractedText] = useState("");
  const [result, setResult] = useState<ExtractResumeResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [savedName, setSavedName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function resetToPick() {
    setStep("pick");
    setVariant(null);
    setFileName(null);
    setFileText("");
    setExtractedText("");
    setResult(null);
    setSavedName(null);
    setError(null);
  }

  function chooseVariant(next: ResumeVariant) {
    setVariant(next);
    setError(null);
    setStep("upload");
  }

  async function handleFile(file: File) {
    setError(null);
    setFileName(file.name);
    setReading(true);
    setFileText("");
    try {
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      const text = isPdf ? await extractPdfText(file) : capResumeText(await file.text());
      setFileText(text);
    } catch {
      setError("Could not read that file. Try a different PDF, or paste the text instead.");
      setFileName(null);
    } finally {
      setReading(false);
    }
  }

  async function handleExtract(pastedText: string) {
    if (!variant) return;
    const text = pastedText.trim().length > 50 ? pastedText.trim() : fileText;
    if (!text || text.trim().length <= 50) {
      setError("Upload a PDF or paste at least 50 characters of résumé text first.");
      return;
    }
    setStep("extracting");
    setError(null);
    try {
      const res = await fetch("/api/resume/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variant, text }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as ApiErrorBody;
        setError(messageForError(body, "Extraction failed. Please try again."));
        setStep("upload");
        return;
      }
      const data = (await res.json()) as ExtractResumeResponse;
      setExtractedText(text);
      setResult(data);
      setStep("review");
    } catch {
      setError("Network error calling the extraction service. Please try again.");
      setStep("upload");
    }
  }

  async function handleSave(data: ResumeData, confirmedCandidateId: string | undefined) {
    if (!variant) return;
    setSubmitting(true);
    setError(null);
    const payload: SaveResumeInput = {
      variant,
      data: data as unknown as Record<string, unknown>,
      originalFilename: fileName ?? "resume.txt",
      mimeType: fileName?.toLowerCase().endsWith(".pdf") ? "application/pdf" : "text/plain",
      extractedText,
      confirmedCandidateId,
    };
    try {
      const res = await fetch("/api/resume/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as ApiErrorBody;
        setError(messageForError(body, "Could not save this candidate. Please try again."));
        return;
      }
      const body = (await res.json()) as { candidate?: { name?: string } };
      setSavedName(body.candidate?.name ?? "Candidate");
      setStep("saved");
    } catch {
      setError("Network error saving the candidate. Please try again.");
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
        <div className="flex flex-col items-center gap-3 rounded-xl border border-black/10 bg-white p-12 text-center">
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

      {step === "saved" ? (
        <EmptyState
          title={`${savedName ?? "Candidate"} saved`}
          description={`Added to the pipeline by ${recruiterName}.`}
          action={
            <Button type="button" onClick={resetToPick}>
              Convert another résumé
            </Button>
          }
        />
      ) : null}
    </div>
  );
}
