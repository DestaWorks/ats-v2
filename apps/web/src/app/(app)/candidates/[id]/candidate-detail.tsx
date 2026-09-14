"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type {
  CandidateDetailDTO,
  CandidateProfileDTO,
  DocumentSummaryDTO,
  NoteDTO,
  UpdateCandidateInput,
  VerifyLicenseInput,
} from "@destaworks/contracts/validation/candidate";
import type { OutreachAttemptDTO } from "@destaworks/contracts/validation/lead";
import type { MentionTarget } from "@destaworks/domain/mentions";
import { DetailTabs, type TabDef } from "@destaworks/ui/tabs";
import { Skeleton } from "@destaworks/ui/skeleton";
import { DetailHeader } from "./detail-header";
import type { ClientOption } from "./details-tab";
import type { MovedFields } from "./lib/detail-fetch";

// Perf audit 2026-08-03: each tab body is only ever mounted when its tab is selected
// (DetailTabs renders `tabs[selected].panel` alone), but a static import still bundles all six
// into the initial page chunk. Loading each on demand keeps the first paint to the "details" tab
// only — the rest ship as separate chunks fetched when a user actually clicks that tab.
const tabLoading = <Skeleton className="h-40 w-full" />;
const DetailsTab = dynamic(() => import("./details-tab").then((m) => m.DetailsTab), {
  loading: () => tabLoading,
});
const ScoringCard = dynamic(() => import("./scoring-card").then((m) => m.ScoringCard));
const FindSimilarButton = dynamic(() =>
  import("../../sourcing/similar-providers-modal").then((m) => m.FindSimilarButton),
);
const LicenseTab = dynamic(() => import("./license-tab").then((m) => m.LicenseTab), {
  loading: () => tabLoading,
});
const ResumeTab = dynamic(() => import("./resume-tab").then((m) => m.ResumeTab), {
  loading: () => tabLoading,
});
const NotesTab = dynamic(() => import("./notes-tab").then((m) => m.NotesTab), {
  loading: () => tabLoading,
});
const OutreachTab = dynamic(() => import("./outreach-tab").then((m) => m.OutreachTab), {
  loading: () => tabLoading,
});

/**
 * Client shell for the candidate detail page. Seeded from the RSC's `CandidateDetailDTO` (no
 * first-paint fetch), it owns the local candidate + notes state and reconciles each mutation's
 * response into that state (then `router.refresh()`s inside the child for cross-view coherence).
 * Mutations announce their outcome through a single `aria-live` region.
 */
export function CandidateDetail({
  initial,
  clients,
  taggable,
  canEditCredential,
  initialTab,
  inModal,
  storageEnabled,
}: {
  initial: CandidateDetailDTO;
  clients: ClientOption[];
  taggable: MentionTarget[];
  canEditCredential: boolean;
  /** Starting tab key (alerts-panel deep links); unknown/absent → first tab. */
  initialTab?: string;
  /** True in the route-intercepted dialog rendering — the header shows Close instead of the back-link. */
  inModal?: boolean;
  /** Whether object storage (Wave 6) is configured — gates the Resume tab's upload control. */
  storageEnabled: boolean;
}) {
  const [candidate, setCandidate] = useState<CandidateProfileDTO>(initial.candidate);
  const [notes, setNotes] = useState<NoteDTO[]>(initial.notes);
  const [outreach, setOutreach] = useState<OutreachAttemptDTO[]>(initial.outreach);
  const [documents, setDocuments] = useState<DocumentSummaryDTO[]>(initial.documents);
  const [announcement, setAnnouncement] = useState("");

  const clientNameById = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);
  const clientName = candidate.clientId ? (clientNameById.get(candidate.clientId) ?? null) : null;

  function announce(message: string) {
    setAnnouncement(message);
  }

  function onMoved(fields: MovedFields) {
    setCandidate((prev) => ({
      ...prev,
      status: fields.status,
      stageOrder: fields.stageOrder,
      stageEnteredAt: fields.stageEnteredAt,
    }));
  }

  function onSaved(input: UpdateCandidateInput) {
    setCandidate((prev) => {
      const next = { ...prev };
      for (const [key, value] of Object.entries(input)) {
        if (value !== undefined) {
          (next as Record<string, unknown>)[key] = value;
        }
      }
      return next;
    });
  }

  function onVerified(input: VerifyLicenseInput) {
    setCandidate((prev) => ({
      ...prev,
      licenseStatus: input.licenseStatus,
      licenseExpiry:
        input.licenseExpiry === undefined
          ? prev.licenseExpiry
          : input.licenseExpiry === null
            ? null
            : new Date(input.licenseExpiry).toISOString(),
      ...(input.licenseNumber !== undefined ? { licenseNumber: input.licenseNumber } : {}),
      licenseVerifiedAt: new Date().toISOString(),
    }));
  }

  function onAdded(note: NoteDTO) {
    setNotes((prev) => [note, ...prev]);
  }

  function onOutreachLogged(attempt: OutreachAttemptDTO) {
    setOutreach((prev) => [attempt, ...prev]);
    // Keep the profile's persisted counter in step (the server incremented it in the same tx).
    setCandidate((prev) => ({ ...prev, outreachAttempts: prev.outreachAttempts + 1 }));
  }

  function onResumeUploaded(document: DocumentSummaryDTO) {
    setDocuments((prev) => [document, ...prev]);
  }

  const tabs: TabDef[] = [
    {
      key: "details",
      label: "Details",
      panel: (
        <div className="flex flex-col gap-4">
          <DetailsTab
            candidate={candidate}
            clients={clients}
            canEditCredential={canEditCredential}
            onSaved={onSaved}
            announce={announce}
          />
          <ScoringCard scoring={initial.scoring} clientName={clientName} />
          <div>
            <FindSimilarButton
              credential={candidate.credential}
              state={candidate.licenseState}
              anchorLabel={candidate.name}
              clients={clients}
            />
          </div>
        </div>
      ),
    },
    {
      key: "license",
      label: "License",
      panel: (
        <LicenseTab
          candidate={candidate}
          canEditCredential={canEditCredential}
          onVerified={onVerified}
          announce={announce}
        />
      ),
    },
    {
      key: "resume",
      label: "Resume",
      panel: (
        <ResumeTab
          candidateId={candidate.id}
          documents={documents}
          canDownload={canEditCredential}
          storageEnabled={storageEnabled}
          onUploaded={onResumeUploaded}
          announce={announce}
        />
      ),
    },
    {
      key: "notes",
      label: `Notes (${notes.length})`,
      panel: (
        <NotesTab
          candidateId={candidate.id}
          notes={notes}
          taggable={taggable}
          onAdded={onAdded}
          announce={announce}
        />
      ),
    },
    {
      key: "outreach",
      label: `Outreach (${outreach.length})`,
      panel: (
        <OutreachTab
          candidateId={candidate.id}
          attempts={outreach}
          onLogged={onOutreachLogged}
          announce={announce}
        />
      ),
    },
  ];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <DetailHeader
        candidate={candidate}
        clientName={clientName}
        scoring={initial.scoring}
        onMoved={onMoved}
        onSaved={onSaved}
        announce={announce}
        {...(inModal !== undefined && { inModal })}
      />

      <DetailTabs
        tabs={tabs}
        {...(initialTab !== undefined && { initialKey: initialTab })}
        ariaLabel="Candidate detail"
      />
    </div>
  );
}
