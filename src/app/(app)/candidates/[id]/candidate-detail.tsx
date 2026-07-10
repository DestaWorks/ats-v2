"use client";

import { useMemo, useState } from "react";
import type {
  CandidateDetailDTO,
  CandidateProfileDTO,
  NoteDTO,
  UpdateCandidateInput,
  VerifyLicenseInput,
} from "@/lib/validation/candidate";
import type { OutreachAttemptDTO } from "@/lib/validation/lead";
import type { MentionTarget } from "@/lib/mentions";
import { DetailHeader } from "./detail-header";
import { DetailTabs, type TabDef } from "./detail-tabs";
import { DetailsTab, type ClientOption } from "./details-tab";
import { ScoringCard } from "./scoring-card";
import { LicenseTab } from "./license-tab";
import { ResumeTab } from "./resume-tab";
import { NotesTab } from "./notes-tab";
import { OutreachTab } from "./outreach-tab";
import type { MovedFields } from "./lib/detail-fetch";

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
}: {
  initial: CandidateDetailDTO;
  clients: ClientOption[];
  taggable: MentionTarget[];
  canEditCredential: boolean;
}) {
  const [candidate, setCandidate] = useState<CandidateProfileDTO>(initial.candidate);
  const [notes, setNotes] = useState<NoteDTO[]>(initial.notes);
  const [outreach, setOutreach] = useState<OutreachAttemptDTO[]>(initial.outreach);
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
      label: "Résumé",
      panel: <ResumeTab documents={initial.documents} />,
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
        announce={announce}
      />

      <DetailTabs tabs={tabs} />
    </div>
  );
}
