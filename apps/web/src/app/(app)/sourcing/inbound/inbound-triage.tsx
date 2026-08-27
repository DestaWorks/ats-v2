"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  INTENT_LABELS,
  type InboundExtractedDTO,
  type InboundIntent,
  type TriageResultDTO,
} from "@destaworks/contracts/validation/inbound";
import type { LeadDetailDTO } from "@destaworks/contracts/validation/lead";
import { messageForFailure, postJson } from "@/lib/api/client";
import type { PostInboundTriageResponse } from "@/app/api/inbound/triage/route";
import type { PostInboundSaveResponse } from "@/app/api/inbound/save/route";
import type { PostInboundAttachResponse } from "@/app/api/inbound/attach/route";
import { Button } from "@destaworks/ui/button";
import { ErrorState } from "@destaworks/ui/error-state";
import { Field } from "@destaworks/ui/field";
import { Input } from "@destaworks/ui/input";
import { Select } from "@destaworks/ui/select";

const INTENTS = Object.keys(INTENT_LABELS) as InboundIntent[];

/** A blank extraction — used when the reviewer edits a field before any AI call (never sent as-is). */
function emptyToNull(v: string): string | null {
  return v.trim() === "" ? null : v;
}

export function InboundTriage({ clients }: { clients: { id: string; name: string }[] }) {
  const [messageText, setMessageText] = useState("");
  const [context, setContext] = useState("");
  const [triagePending, startTriage] = useTransition();
  const [savePending, startSave] = useTransition();
  const [triageError, setTriageError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [result, setResult] = useState<TriageResultDTO | null>(null);
  const [extracted, setExtracted] = useState<InboundExtractedDTO | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [saved, setSaved] = useState<LeadDetailDTO | null>(null);

  function patchExtracted(patch: Partial<InboundExtractedDTO>) {
    setExtracted((x) => (x ? { ...x, ...patch } : x));
  }

  function handleTriage() {
    setTriageError(null);
    startTriage(async () => {
      const res = await postJson<PostInboundTriageResponse>("/api/inbound/triage", {
        messageText,
        context: context.trim() || null,
      });
      if (res.ok) {
        setResult(res.data);
        setExtracted(res.data.extracted);
        setClientId(res.data.clientMatches[0]?.clientId ?? null);
        setSaved(null);
      } else {
        setTriageError(messageForFailure(res.failure));
        toast.error(messageForFailure(res.failure));
      }
    });
  }

  function handleClear() {
    setMessageText("");
    setContext("");
    setResult(null);
    setExtracted(null);
    setClientId(null);
    setTriageError(null);
    setSaveError(null);
    setSaved(null);
  }

  function handleSave() {
    if (!extracted?.name) {
      setSaveError("A name is required to save this as a lead.");
      return;
    }
    setSaveError(null);
    startSave(async () => {
      const res = await postJson<PostInboundSaveResponse>("/api/inbound/save", {
        name: extracted.name,
        email: extracted.email,
        phone: extracted.phone,
        linkedinUrl: extracted.linkedinUrl,
        credential: extracted.credential,
        state: extracted.state,
        clientId,
        summary: extracted.summary,
        message: messageText,
      });
      if (res.ok) {
        toast.success("Saved as a Sourced lead, Responded — Hot");
        setSaved(res.data.lead);
      } else {
        setSaveError(messageForFailure(res.failure));
        toast.error(messageForFailure(res.failure));
      }
    });
  }

  function handleAttach(leadId: string) {
    if (!extracted?.name) {
      setSaveError("A name is required to attach this reply.");
      return;
    }
    setSaveError(null);
    startSave(async () => {
      // Send the CURRENT (possibly reviewer-edited) name/email, not just the id — the server
      // re-runs its own dedupe match against them and refuses to attach if the edited identity no
      // longer points at this lead, since the "Attach to this lead" match ran once, before any
      // edits, and could otherwise silently log the reply to the wrong person.
      const res = await postJson<PostInboundAttachResponse>("/api/inbound/attach", {
        leadId,
        name: extracted.name,
        email: extracted.email,
        message: messageText,
      });
      if (res.ok) {
        toast.success("Attached to the existing lead, marked Hot");
        setSaved(res.data.lead);
      } else {
        setSaveError(messageForFailure(res.failure));
        toast.error(messageForFailure(res.failure));
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-4 rounded-lg border border-black/10 bg-white shadow-card p-5">
        <Field label="Pasted message" htmlFor="it-message" required>
          <textarea
            id="it-message"
            rows={10}
            placeholder="Paste the candidate's reply here…"
            className="w-full resize-y rounded-md border border-black/15 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-navy focus:outline-none disabled:opacity-50"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            disabled={triagePending}
          />
        </Field>
        <Field
          label="Context for the AI (optional)"
          htmlFor="it-context"
          hint="e.g. which job post this came from"
        >
          <Input
            id="it-context"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            disabled={triagePending}
          />
        </Field>

        {triageError ? <ErrorState message={triageError} /> : null}

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="purple"
            loading={triagePending}
            disabled={messageText.trim().length < 10}
            onClick={handleTriage}
          >
            ✨ Triage with AI
          </Button>
          <Button type="button" variant="ghost" disabled={triagePending} onClick={handleClear}>
            Clear
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {!result || !extracted ? (
          <div className="flex h-full min-h-48 items-center justify-center rounded-lg border border-dashed border-black/15 p-6 text-center text-sm text-gray">
            Paste a message and run AI Triage to see the extracted details here.
          </div>
        ) : saved ? (
          <div className="flex flex-col gap-3 rounded-lg border border-green/30 bg-green/10 p-5">
            <p className="text-sm font-semibold text-charcoal">
              Saved — {saved.name} is now Responded — Hot.
            </p>
            <div className="flex gap-2">
              <Link href="/sourcing" className="text-sm font-semibold text-navy hover:underline">
                Back to Sourcing
              </Link>
              <Button type="button" variant="secondary" size="sm" onClick={handleClear}>
                Triage another message
              </Button>
            </div>
          </div>
        ) : (
          <>
            <ExtractedDetailsCard
              extracted={extracted}
              onPatch={patchExtracted}
              existing={result.existing}
              onAttach={handleAttach}
              attachPending={savePending}
              clients={clients}
              clientId={clientId}
              onClientChange={setClientId}
            />

            {result.clientMatches.length > 0 ? (
              <div className="rounded-lg border border-black/10 bg-white shadow-card p-5">
                <h2 className="mb-3 text-sm font-bold text-navy">Suggested clients</h2>
                <ul className="flex flex-col gap-2">
                  {result.clientMatches.map((m) => (
                    <li key={m.clientId}>
                      <label className="flex cursor-pointer items-start gap-3 rounded-md border border-black/10 p-3 has-[:checked]:border-navy has-[:checked]:bg-navy/5">
                        <input
                          type="radio"
                          name="it-client-match"
                          className="mt-1"
                          checked={clientId === m.clientId}
                          onChange={() => setClientId(m.clientId)}
                        />
                        <span className="flex flex-1 flex-col gap-0.5">
                          <span className="flex items-center justify-between">
                            <span className="font-semibold text-charcoal">{m.clientName}</span>
                            <span className="text-xs font-semibold text-gray">{m.score}% fit</span>
                          </span>
                          <span className="text-xs text-gray">{m.reasons.join(" · ")}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {saveError ? <ErrorState message={saveError} /> : null}

            {!(result.existing?.kind === "candidate") ? (
              <Button
                type="button"
                variant="success"
                loading={savePending}
                onClick={handleSave}
                className="self-start"
              >
                Save as Sourced Lead (Responded — Hot)
              </Button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function ExtractedDetailsCard({
  extracted,
  onPatch,
  existing,
  onAttach,
  attachPending,
  clients,
  clientId,
  onClientChange,
}: {
  extracted: InboundExtractedDTO;
  onPatch: (patch: Partial<InboundExtractedDTO>) => void;
  existing: TriageResultDTO["existing"];
  onAttach: (leadId: string) => void;
  attachPending: boolean;
  clients: { id: string; name: string }[];
  clientId: string | null;
  onClientChange: (clientId: string | null) => void;
}) {
  return (
    <div className="rounded-lg border border-black/10 bg-white shadow-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-navy">Extracted details</h2>
        <span className="rounded-full bg-navy/10 px-2.5 py-0.5 text-xs font-semibold text-navy">
          {INTENT_LABELS[extracted.intent]}
        </span>
      </div>

      {existing ? (
        <ExistingMatchBanner existing={existing} onAttach={onAttach} pending={attachPending} />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          id="it-name"
          label="Name"
          required
          value={extracted.name}
          onValue={(name) => onPatch({ name })}
        />
        <TextField
          id="it-email"
          label="Email"
          type="email"
          value={extracted.email}
          onValue={(email) => onPatch({ email })}
        />
        <TextField
          id="it-phone"
          label="Phone"
          value={extracted.phone}
          onValue={(phone) => onPatch({ phone })}
        />
        <TextField
          id="it-linkedin"
          label="LinkedIn URL"
          value={extracted.linkedinUrl}
          onValue={(linkedinUrl) => onPatch({ linkedinUrl })}
        />
        <TextField
          id="it-cred"
          label="Credential"
          value={extracted.credential}
          onValue={(credential) => onPatch({ credential })}
        />
        <TextField
          id="it-license-state"
          label="License state"
          value={extracted.licenseState}
          onValue={(licenseState) => onPatch({ licenseState })}
        />
        <TextField
          id="it-state"
          label="State"
          value={extracted.state}
          onValue={(state) => onPatch({ state })}
        />
        <TextField
          id="it-city"
          label="City"
          value={extracted.city}
          onValue={(city) => onPatch({ city })}
        />
        <TextField
          id="it-setting"
          label="Setting preference"
          value={extracted.settingPreference}
          onValue={(settingPreference) => onPatch({ settingPreference })}
        />
        <TextField
          id="it-population"
          label="Population preference"
          value={extracted.populationPreference}
          onValue={(populationPreference) => onPatch({ populationPreference })}
        />
        <TextField
          id="it-rate"
          label="Rate expectation"
          value={extracted.rateExpectation}
          onValue={(rateExpectation) => onPatch({ rateExpectation })}
        />
        <TextField
          id="it-availability"
          label="Availability"
          value={extracted.availability}
          onValue={(availability) => onPatch({ availability })}
        />
        <Field label="Intent" htmlFor="it-intent">
          <Select
            id="it-intent"
            value={extracted.intent}
            onChange={(e) => onPatch({ intent: e.target.value as InboundIntent })}
          >
            {INTENTS.map((i) => (
              <option key={i} value={i}>
                {INTENT_LABELS[i]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Target client" htmlFor="it-client" className="sm:col-span-2">
          <Select
            id="it-client"
            value={clientId ?? ""}
            onChange={(e) => onClientChange(e.target.value || null)}
          >
            <option value="">Unassigned</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Summary" htmlFor="it-summary" className="sm:col-span-2">
          <textarea
            id="it-summary"
            rows={2}
            className="w-full resize-y rounded-md border border-black/15 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-navy focus:outline-none disabled:opacity-50"
            value={extracted.summary ?? ""}
            onChange={(e) => onPatch({ summary: e.target.value })}
          />
        </Field>
      </div>
    </div>
  );
}

function TextField({
  id,
  label,
  value,
  onValue,
  type,
  required,
}: {
  id: string;
  label: string;
  value: string | null;
  onValue: (value: string | null) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <Field label={label} htmlFor={id} required={required ?? false}>
      <Input
        id={id}
        type={type}
        value={value ?? ""}
        onChange={(e) => onValue(emptyToNull(e.target.value))}
      />
    </Field>
  );
}

function ExistingMatchBanner({
  existing,
  onAttach,
  pending,
}: {
  existing: NonNullable<TriageResultDTO["existing"]>;
  onAttach: (leadId: string) => void;
  pending: boolean;
}) {
  if (existing.kind === "candidate") {
    return (
      <div className="mb-4 rounded-md border border-orange/30 bg-orange/10 p-3 text-sm">
        Matches an existing candidate, <strong>{existing.name}</strong> ({existing.matchedOn}) —
        already in the pipeline.{" "}
        <Link
          href={`/candidates/${existing.id}`}
          className="font-semibold text-navy hover:underline"
        >
          View candidate
        </Link>
      </div>
    );
  }
  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-orange/30 bg-orange/10 p-3 text-sm">
      <span>
        Matches an existing lead, <strong>{existing.name}</strong> ({existing.matchedOn}).
      </span>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        loading={pending}
        onClick={() => onAttach(existing.id)}
      >
        Attach to this lead
      </Button>
    </div>
  );
}
