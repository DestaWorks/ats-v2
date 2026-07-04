"use client";

import type { ResumeVariant } from "@/lib/constants/documents";
import type {
  ClinicalResume,
  OperationsResume,
  PrescriberResume,
  ResumeData,
  ResumeMatch,
} from "@/lib/validation/resume";
import { ClinicalLayout } from "./clinical-layout";
import { PrescriberLayout } from "./prescriber-layout";
import { OperationsLayout } from "./operations-layout";
import type { SaveHandler } from "./common-sections";

/**
 * Review step dispatcher (design §7): renders the variant-specific inline-editable profile
 * layout over the extracted data, wired to a react-hook-form + zod form inside each layout.
 */
export function ReviewForm({
  variant,
  data,
  match,
  submitting,
  onSave,
}: {
  variant: ResumeVariant;
  data: ResumeData;
  match: ResumeMatch;
  submitting: boolean;
  onSave: SaveHandler;
}) {
  switch (variant) {
    case "clinical":
      return (
        <ClinicalLayout
          data={data as ClinicalResume}
          match={match}
          submitting={submitting}
          onSave={onSave}
        />
      );
    case "prescriber":
      return (
        <PrescriberLayout
          data={data as PrescriberResume}
          match={match}
          submitting={submitting}
          onSave={onSave}
        />
      );
    case "operations":
      return (
        <OperationsLayout
          data={data as OperationsResume}
          match={match}
          submitting={submitting}
          onSave={onSave}
        />
      );
  }
}
