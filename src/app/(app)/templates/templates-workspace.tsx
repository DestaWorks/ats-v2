"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  TEMPLATE_CATEGORIES,
  TEMPLATES,
  templatesByCategory,
  findTemplate,
  clientTemplateInfo,
  type TemplateDef,
} from "@/lib/constants/templates";
import { OUTREACH_CHANNELS, type OutreachChannel } from "@/lib/constants/lead-status";
import { fillTemplate, type TemplateFillContext } from "@/lib/rules/fill-template";
import { adaptCandidateToRecipient, adaptLeadToRecipient } from "@/lib/rules/adapt-recipient";
import { getJson, postJson, messageForFailure } from "@/lib/api/client";
import type {
  CandidateListDTO,
  CandidateListItemDTO,
  CandidateProfileDTO,
} from "@/lib/validation/candidate";
import type { LeadListDTO, LeadListItemDTO } from "@/lib/validation/lead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { SignatureEditor } from "./signature-editor";
import { TemplatePerformanceButton } from "./template-performance-modal";

export interface ClientOption {
  id: string;
  name: string;
}

type RecipientType = "candidate" | "lead";

export function TemplatesWorkspace({
  clients,
  recruiterName,
  canViewPerformance,
  initialSignature,
}: {
  clients: ClientOption[];
  recruiterName: string;
  canViewPerformance: boolean;
  initialSignature: string | null;
}) {
  const [view, setView] = useState<"templates" | "signature">("templates");
  const [signature, setSignature] = useState(initialSignature);

  const [templateId, setTemplateId] = useState(TEMPLATES[0]!.id);
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [recipientType, setRecipientType] = useState<RecipientType>("candidate");
  const [channel, setChannel] = useState<OutreachChannel>("email");
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);

  const [candSearch, setCandSearch] = useState("");
  const [candResults, setCandResults] = useState<CandidateListItemDTO[]>([]);
  const [candidate, setCandidate] = useState<CandidateProfileDTO | null>(null);

  const [leadSearch, setLeadSearch] = useState("");
  const [leadResults, setLeadResults] = useState<LeadListItemDTO[]>([]);
  const [lead, setLead] = useState<LeadListItemDTO | null>(null);

  const selTpl: TemplateDef = findTemplate(templateId) ?? TEMPLATES[0]!;
  const client = clients.find((c) => c.id === clientId);
  const clientName = client?.name ?? "";
  const info = clientTemplateInfo(clientName);

  const today = useMemo(
    () =>
      new Date().toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" }),
    [],
  );

  const recipient = useMemo(() => {
    if (recipientType === "candidate")
      return candidate ? adaptCandidateToRecipient(candidate) : null;
    return lead ? adaptLeadToRecipient(lead) : null;
  }, [recipientType, candidate, lead]);

  const ctx: TemplateFillContext = {
    recipient,
    clientName,
    clientDesc: info.desc,
    clientContact: info.contactTitle,
    clientHighlights: info.highlights,
    recruiterName,
    today,
  };
  const filledSubject = fillTemplate(selTpl.subject, ctx);
  const sigBlock = signature
    ? `\n\n${signature}`
    : `\n\nBest regards,\n${recruiterName}\nHealthcare Recruiting Associate\nDestaHealth Recruiting`;
  const filledBody = fillTemplate(selTpl.body, ctx) + sigBlock;

  // Candidate search — debounced, scoped to the selected client (matches legacy).
  useEffect(() => {
    if (recipientType !== "candidate" || candSearch.trim().length < 2 || candidate) {
      setCandResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      const params = new URLSearchParams({ search: candSearch, clientId, page: "1" });
      const res = await getJson<CandidateListDTO>(`/api/candidates/list?${params}`);
      if (res.ok) setCandResults(res.data.candidates);
    }, 300);
    return () => clearTimeout(handle);
  }, [recipientType, candSearch, clientId, candidate]);

  // Lead search — debounced; excludes Promoted/Bad Fit/deleted (matches legacy).
  useEffect(() => {
    if (recipientType !== "lead" || leadSearch.trim().length < 2 || lead) {
      setLeadResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      const params = new URLSearchParams({ search: leadSearch, page: "1" });
      const res = await getJson<LeadListDTO>(`/api/leads/list?${params}`);
      if (res.ok) {
        setLeadResults(
          res.data.leads.filter((l) => l.status !== "Promoted" && l.status !== "Bad Fit"),
        );
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [recipientType, leadSearch, lead]);

  async function pickCandidate(item: CandidateListItemDTO) {
    setCandSearch(`${item.name} (${item.credential ?? "?"})`);
    setCandResults([]);
    const res = await getJson<{ candidate: CandidateProfileDTO }>(`/api/candidates/${item.id}`);
    if (res.ok) setCandidate(res.data.candidate);
    else toast.error(messageForFailure(res.failure));
  }

  function pickLead(item: LeadListItemDTO) {
    setLeadSearch(`${item.name} (${item.credential ?? "?"}, ${item.status})`);
    setLeadResults([]);
    setLead(item);
  }

  function switchRecipientType(next: RecipientType) {
    setRecipientType(next);
    setCandSearch("");
    setCandidate(null);
    setLeadSearch("");
    setLead(null);
  }

  async function logSent() {
    setSending(true);
    try {
      if (recipientType === "lead" && lead) {
        const res = await postJson(`/api/leads/${lead.id}/outreach`, {
          channel,
          note: `Template sent: ${selTpl.name} (${TEMPLATE_CATEGORIES.find((c) => c.id === selTpl.category)?.name})`,
          templateId: selTpl.id,
        });
        if (!res.ok) toast.error(messageForFailure(res.failure));
      } else if (recipientType === "candidate" && candidate) {
        const res = await postJson(`/api/candidates/${candidate.id}/outreach`, {
          channel: "email",
          note: `Template sent: ${selTpl.name} (${TEMPLATE_CATEGORIES.find((c) => c.id === selTpl.category)?.name}) — ${filledSubject}`,
          templateId: selTpl.id,
        });
        if (!res.ok) toast.error(messageForFailure(res.failure));
      }
    } finally {
      setSending(false);
    }
  }

  function copyAll() {
    navigator.clipboard.writeText(`Subject: ${filledSubject}\n\n${filledBody}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    void logSent();
  }

  function openGmail() {
    const to = recipientType === "candidate" ? (candidate?.email ?? "") : (lead?.email ?? "");
    const url = `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(to)}&su=${encodeURIComponent(filledSubject)}&body=${encodeURIComponent(filledBody)}`;
    window.open(url, "_blank");
    void logSent();
  }

  if (view === "signature") {
    return (
      <SignatureEditor
        recruiterName={recruiterName}
        signature={signature}
        onSaved={(next) => {
          setSignature(next);
          setView("templates");
        }}
        onCancel={() => setView("templates")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end gap-2">
        {canViewPerformance ? <TemplatePerformanceButton /> : null}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setView("signature")}
          className={signature ? "bg-green/10 text-green" : undefined}
        >
          ✉ Email Signature
        </Button>
      </div>

      {/* Category selector */}
      <div className="flex gap-1.5">
        {TEMPLATE_CATEGORIES.map((cat) => {
          const count = templatesByCategory(cat.id).length;
          const active = selTpl.category === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setTemplateId(templatesByCategory(cat.id)[0]!.id)}
              className={`flex-1 rounded-lg border px-2 py-2.5 text-center transition ${
                active ? "border-navy bg-black/[0.02]" : "border-black/10 bg-white"
              }`}
            >
              <div className="text-sm">{cat.icon}</div>
              <div className={`mt-1 text-xs font-bold ${active ? "text-navy" : "text-charcoal"}`}>
                {cat.name}
              </div>
              <div className="text-[10px] text-gray">
                {count} template{count > 1 ? "s" : ""}
              </div>
            </button>
          );
        })}
      </div>

      {/* Template selector */}
      <div className="flex flex-wrap gap-1.5">
        {templatesByCategory(selTpl.category).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTemplateId(t.id)}
            className={`rounded-md border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap ${
              templateId === t.id
                ? "border-navy bg-navy text-white"
                : "border-black/10 bg-white text-charcoal"
            }`}
          >
            {t.name}{" "}
            <Badge tone={t.dir === "to-client" ? "success" : "navy"} size="sm" className="ml-1">
              {t.dir === "to-client" ? "→ Client" : "→ Candidate"}
            </Badge>
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="grid grid-cols-2 gap-3 rounded-xl border border-black/5 bg-white p-4">
        <div>
          <div className="mb-1 text-[11px] text-gray">CLIENT</div>
          <Select
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              switchRecipientType(recipientType);
            }}
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] text-gray">RECIPIENT</span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => switchRecipientType("candidate")}
                className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                  recipientType === "candidate"
                    ? "bg-navy text-white"
                    : "border border-black/15 text-gray"
                }`}
              >
                Candidate
              </button>
              <button
                type="button"
                onClick={() => switchRecipientType("lead")}
                className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                  recipientType === "lead"
                    ? "bg-purple text-white"
                    : "border border-black/15 text-gray"
                }`}
              >
                Sourced Lead
              </button>
            </div>
          </div>
          {recipientType === "candidate" ? (
            <div className="relative">
              <Input
                value={candSearch}
                onChange={(e) => {
                  setCandSearch(e.target.value);
                  setCandidate(null);
                }}
                placeholder="Search candidate name..."
              />
              {candSearch.trim().length >= 2 && !candidate ? (
                <div className="absolute top-full right-0 left-0 z-10 max-h-45 overflow-y-auto rounded-md border border-black/10 bg-white shadow-lg">
                  {candResults.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-gray">No matches</div>
                  ) : (
                    candResults.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => void pickCandidate(c)}
                        className="block w-full border-b border-black/5 px-3 py-2 text-left text-xs hover:bg-black/[0.03]"
                      >
                        {c.name} <span className="text-gray">({c.credential ?? "?"})</span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="relative">
              <Input
                value={leadSearch}
                onChange={(e) => {
                  setLeadSearch(e.target.value);
                  setLead(null);
                }}
                placeholder="Search sourced lead by name..."
                className="border-purple"
              />
              {leadSearch.trim().length >= 2 && !lead ? (
                <div className="absolute top-full right-0 left-0 z-10 max-h-45 overflow-y-auto rounded-md border border-purple bg-white shadow-lg">
                  {leadResults.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-gray">
                      No matches in Sourcing inventory
                    </div>
                  ) : (
                    leadResults.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => pickLead(l)}
                        className="block w-full border-b border-black/5 px-3 py-2 text-left text-xs hover:bg-[#FCF0FF]"
                      >
                        {l.name}{" "}
                        <span className="text-gray">
                          ({l.credential ?? "?"}, {l.status})
                        </span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
              {lead ? (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="text-[10px] text-purple">✓ Channel:</span>
                  <Select
                    value={channel}
                    onChange={(e) => setChannel(e.target.value as OutreachChannel)}
                    className="w-auto px-1.5 py-0.5 text-[10px]"
                  >
                    {OUTREACH_CHANNELS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                  <span className="text-[10px] text-gray">auto-logs on send</span>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Preview */}
      <div className="rounded-xl border border-black/5 bg-white p-4">
        <div className="mb-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold">Preview</span>
            <Badge tone="neutral" size="sm">
              {TEMPLATE_CATEGORIES.find((c) => c.id === selTpl.category)?.name}
            </Badge>
            <Badge tone={selTpl.dir === "to-client" ? "success" : "navy"} size="sm">
              {selTpl.dir === "to-client" ? "To Client" : "To Candidate"}
            </Badge>
          </div>
          <div className="flex gap-1.5">
            <Button type="button" size="sm" onClick={copyAll} loading={sending}>
              {copied ? "Copied!" : "Copy All"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={openGmail}
              disabled={sending}
            >
              Open in Gmail
            </Button>
          </div>
        </div>
        <div className="mb-2.5 rounded-lg bg-[#f8f9ff] p-3.5">
          <div className="mb-1 text-[11px] text-gray">SUBJECT</div>
          <div className="text-sm font-semibold">{filledSubject}</div>
        </div>
        <div className="rounded-lg bg-[#f8f9ff] p-3.5 whitespace-pre-wrap">
          <div className="mb-1 text-[11px] text-gray">BODY</div>
          <div className="text-sm">{filledBody}</div>
        </div>
      </div>
    </div>
  );
}
