"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  INTENT_LABELS,
  type InboundExtractedDTO,
  type InboundIntent,
  type TriageResultDTO,
} from "@/lib/validation/inbound";
import type { LeadDetailDTO } from "@/lib/validation/lead";
import { messageForFailure, postJson } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

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

  function handleTriage() {
    setTriageError(null);
    startTriage(async () => {
      const res = await postJson<TriageResultDTO>("/api/inbound/triage", {
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
      const res = await postJson<{ lead: LeadDetailDTO }>("/api/inbound/save", {
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
    setSaveError(null);
    startSave(async () => {
      const res = await postJson<{ lead: LeadDetailDTO }>("/api/inbound/attach", {
        leadId,
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
      <div className="flex flex-col gap-4 rounded-lg border border-black/10 bg-white p-5">
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
        {!result ? (
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
            <div className="rounded-lg border border-black/10 bg-white p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold text-navy">Extracted details</h2>
                <span className="rounded-full bg-navy/10 px-2.5 py-0.5 text-xs font-semibold text-navy">
                  {INTENT_LABELS[extracted!.intent]}
                </span>
              </div>

              {result.existing ? (
                <ExistingMatchBanner
                  existing={result.existing}
                  onAttach={handleAttach}
                  pending={savePending}
                />
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name" htmlFor="it-name" required>
                  <Input
                    id="it-name"
                    value={extracted!.name ?? ""}
                    onChange={(e) =>
                      setExtracted((x) => (x ? { ...x, name: emptyToNull(e.target.value) } : x))
                    }
                  />
                </Field>
                <Field label="Email" htmlFor="it-email">
                  <Input
                    id="it-email"
                    type="email"
                    value={extracted!.email ?? ""}
                    onChange={(e) =>
                      setExtracted((x) => (x ? { ...x, email: emptyToNull(e.target.value) } : x))
                    }
                  />
                </Field>
                <Field label="Phone" htmlFor="it-phone">
                  <Input
                    id="it-phone"
                    value={extracted!.phone ?? ""}
                    onChange={(e) =>
                      setExtracted((x) => (x ? { ...x, phone: emptyToNull(e.target.value) } : x))
                    }
                  />
                </Field>
                <Field label="LinkedIn URL" htmlFor="it-linkedin">
                  <Input
                    id="it-linkedin"
                    value={extracted!.linkedinUrl ?? ""}
                    onChange={(e) =>
                      setExtracted((x) =>
                        x ? { ...x, linkedinUrl: emptyToNull(e.target.value) } : x,
                      )
                    }
                  />
                </Field>
                <Field label="Credential" htmlFor="it-cred">
                  <Input
                    id="it-cred"
                    value={extracted!.credential ?? ""}
                    onChange={(e) =>
                      setExtracted((x) =>
                        x ? { ...x, credential: emptyToNull(e.target.value) } : x,
                      )
                    }
                  />
                </Field>
                <Field label="License state" htmlFor="it-license-state">
                  <Input
                    id="it-license-state"
                    value={extracted!.licenseState ?? ""}
                    onChange={(e) =>
                      setExtracted((x) =>
                        x ? { ...x, licenseState: emptyToNull(e.target.value) } : x,
                      )
                    }
                  />
                </Field>
                <Field label="State" htmlFor="it-state">
                  <Input
                    id="it-state"
                    value={extracted!.state ?? ""}
                    onChange={(e) =>
                      setExtracted((x) => (x ? { ...x, state: emptyToNull(e.target.value) } : x))
                    }
                  />
                </Field>
                <Field label="City" htmlFor="it-city">
                  <Input
                    id="it-city"
                    value={extracted!.city ?? ""}
                    onChange={(e) =>
                      setExtracted((x) => (x ? { ...x, city: emptyToNull(e.target.value) } : x))
                    }
                  />
                </Field>
                <Field label="Setting preference" htmlFor="it-setting">
                  <Input
                    id="it-setting"
                    value={extracted!.settingPreference ?? ""}
                    onChange={(e) =>
                      setExtracted((x) =>
                        x ? { ...x, settingPreference: emptyToNull(e.target.value) } : x,
                      )
                    }
                  />
                </Field>
                <Field label="Population preference" htmlFor="it-population">
                  <Input
                    id="it-population"
                    value={extracted!.populationPreference ?? ""}
                    onChange={(e) =>
                      setExtracted((x) =>
                        x ? { ...x, populationPreference: emptyToNull(e.target.value) } : x,
                      )
                    }
                  />
                </Field>
                <Field label="Rate expectation" htmlFor="it-rate">
                  <Input
                    id="it-rate"
                    value={extracted!.rateExpectation ?? ""}
                    onChange={(e) =>
                      setExtracted((x) =>
                        x ? { ...x, rateExpectation: emptyToNull(e.target.value) } : x,
                      )
                    }
                  />
                </Field>
                <Field label="Availability" htmlFor="it-availability">
                  <Input
                    id="it-availability"
                    value={extracted!.availability ?? ""}
                    onChange={(e) =>
                      setExtracted((x) =>
                        x ? { ...x, availability: emptyToNull(e.target.value) } : x,
                      )
                    }
                  />
                </Field>
                <Field label="Intent" htmlFor="it-intent">
                  <Select
                    id="it-intent"
                    value={extracted!.intent}
                    onChange={(e) =>
                      setExtracted((x) =>
                        x ? { ...x, intent: e.target.value as InboundIntent } : x,
                      )
                    }
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
                    onChange={(e) => setClientId(e.target.value || null)}
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
                    value={extracted!.summary ?? ""}
                    onChange={(e) =>
                      setExtracted((x) => (x ? { ...x, summary: e.target.value } : x))
                    }
                  />
                </Field>
              </div>
            </div>

            {result.clientMatches.length > 0 ? (
              <div className="rounded-lg border border-black/10 bg-white p-5">
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
