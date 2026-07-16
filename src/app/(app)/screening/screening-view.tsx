"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { scoreScreening, type ScreeningClientRules } from "@/lib/rules/screening";
import type { SaveScreeningInput, ScreeningCandidateDTO } from "@/lib/validation/screening";
import type { ScheduleOption } from "@/lib/constants";
import { messageForFailure } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { CandidatePicker } from "./candidate-picker";
import { ScoreHeader } from "./score-header";
import { SectionCredential } from "./section-credential";
import { SectionState } from "./section-state";
import { SectionExperience } from "./section-experience";
import { SectionSchedule } from "./section-schedule";
import { SectionSalary } from "./section-salary";
import { SectionCommunication } from "./section-communication";
import { ScreeningActions } from "./screening-actions";
import { postScreening, searchScreeningCandidates } from "./lib/screening-fetch";

interface FormState {
  credentialsHeld: string[];
  statesHeld: string[];
  yearsExp: string;
  schedule: string;
  salaryAsk: string;
  commChecklist: string[];
  notes: string;
}

const EMPTY_FORM: FormState = {
  credentialsHeld: [],
  statesHeld: [],
  yearsExp: "",
  schedule: "",
  salaryAsk: "",
  commChecklist: [],
  notes: "",
};

/**
 * Screening (Wave 3.3) — the direct analogue of legacy's `vw==="screening"` block
 * (`legacy/index.html:6689-6928`), split into real components instead of one giant JSX blob. Holds
 * the candidate picker + form state; scores LIVE client-side via the pure `scoreScreening` for
 * instant feedback as the recruiter fills out the form (the server independently and
 * authoritatively recomputes at save-time — the client score is UX only, never trusted).
 */
export function ScreeningView({
  initialCandidates,
}: {
  initialCandidates: ScreeningCandidateDTO[];
}) {
  const [candidates, setCandidates] = useState(initialCandidates);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ScreeningCandidateDTO | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [pending, startTransition] = useTransition();

  // Re-search on debounce (mirrors the other pages' 300ms debounce convention).
  useEffect(() => {
    const handle = setTimeout(() => {
      void searchScreeningCandidates(search).then((res) => {
        if (res.ok) setCandidates(res.data.candidates);
      });
    }, 300);
    return () => clearTimeout(handle);
  }, [search]);

  function selectCandidate(candidate: ScreeningCandidateDTO) {
    setSelected(candidate);
    setForm({
      ...EMPTY_FORM,
      yearsExp: candidate.yearsExp != null ? String(candidate.yearsExp) : "",
    });
  }

  const result = useMemo(() => {
    if (!selected) return null;
    const clientRules: ScreeningClientRules | null = selected.clientId
      ? { states: selected.clientStates, schedule: selected.clientSchedule }
      : null;
    return scoreScreening(
      {
        credential: selected.credential,
        credentialsHeld: form.credentialsHeld,
        statesHeld: form.statesHeld,
        yearsExp: form.yearsExp ? Number(form.yearsExp) : null,
        schedule: form.schedule || null,
        salaryAsk: form.salaryAsk ? Number(form.salaryAsk) : null,
        commChecklist: form.commChecklist,
      },
      clientRules,
    );
  }, [selected, form]);

  function submit(action: SaveScreeningInput["action"]) {
    if (!selected) return;
    startTransition(async () => {
      const input: SaveScreeningInput = {
        credentialsHeld: form.credentialsHeld,
        statesHeld: form.statesHeld as SaveScreeningInput["statesHeld"],
        yearsExp: form.yearsExp ? Number(form.yearsExp) : null,
        schedule: (form.schedule || null) as ScheduleOption | null,
        salaryAsk: form.salaryAsk ? Number(form.salaryAsk) : null,
        commChecklist: form.commChecklist as SaveScreeningInput["commChecklist"],
        notes: form.notes.trim() || null,
        action,
      };
      const res = await postScreening(selected.id, input);
      if (!res.ok) {
        toast.error(messageForFailure(res.failure));
        return;
      }
      const { scorecard } = res.data;
      if (scorecard.moved) {
        toast.success(`Scorecard saved — moved to ${scorecard.moved.toStatus}`);
        // The candidate is no longer eligible for screening once moved — drop it from the picker.
        setCandidates((prev) => prev.filter((c) => c.id !== selected.id));
        setSelected(null);
        setForm(EMPTY_FORM);
      } else {
        toast.success("Scorecard saved");
      }
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
      <CandidatePicker
        candidates={candidates}
        search={search}
        onSearchChange={setSearch}
        selectedId={selected?.id ?? null}
        onSelect={selectCandidate}
      />

      {!selected ? (
        <Card className="flex items-center justify-center p-8 text-sm text-gray">
          Select a candidate to start screening.
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {result ? <ScoreHeader result={result} /> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <SectionCredential
              credential={selected.credential}
              held={form.credentialsHeld}
              onChange={(credentialsHeld) => setForm({ ...form, credentialsHeld })}
              score={result?.sections.cred ?? 0}
            />
            <SectionState
              clientStates={selected.clientStates}
              held={form.statesHeld}
              onChange={(statesHeld) => setForm({ ...form, statesHeld })}
              score={result?.sections.state ?? 0}
            />
            <SectionExperience
              yearsExp={form.yearsExp}
              onChange={(yearsExp) => setForm({ ...form, yearsExp })}
              score={result?.sections.exp ?? 0}
            />
            <SectionSchedule
              schedule={form.schedule}
              onChange={(schedule) => setForm({ ...form, schedule })}
              score={result?.sections.schedule ?? 0}
            />
            <SectionSalary
              credential={selected.credential}
              salaryAsk={form.salaryAsk}
              onChange={(salaryAsk) => setForm({ ...form, salaryAsk })}
              score={result?.sections.salary ?? 0}
            />
            <SectionCommunication
              checklist={form.commChecklist}
              onChange={(commChecklist) => setForm({ ...form, commChecklist })}
              score={result?.sections.comm ?? 0}
            />
          </div>
          <Card className="p-4">
            <label htmlFor="sc-notes" className="mb-2 block text-sm font-semibold text-charcoal">
              Screening Notes
            </label>
            <textarea
              id="sc-notes"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Key observations, concerns, highlights from the screening call..."
              className="w-full resize-y rounded-md border border-black/15 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-navy focus:outline-none"
            />
          </Card>
          <ScreeningActions totalPct={result?.totalPct ?? 0} pending={pending} onSubmit={submit} />
        </div>
      )}
    </div>
  );
}
