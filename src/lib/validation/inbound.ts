/**
 * Inbound Triage contract (Wave 2.8) — isomorphic types + zod shared by the triage routes and
 * the `/sourcing/inbound` client. Pure (NO server imports). Extraction runs SERVER-side via the
 * provider-agnostic AI layer (`server/ai`); the client only posts raw text and renders the
 * editable result.
 */
import { z } from "zod";

/** Legacy intent labels (ported verbatim). */
export const INBOUND_INTENTS = [
  "open_to_opportunity",
  "asking_about_pay",
  "scheduling",
  "not_interested",
  "asking_question",
  "other",
] as const;
export type InboundIntent = (typeof INBOUND_INTENTS)[number];

export const INTENT_LABELS: Record<InboundIntent, string> = {
  open_to_opportunity: "Open to opportunity",
  asking_about_pay: "Asking about pay",
  scheduling: "Scheduling",
  not_interested: "Not interested",
  asking_question: "Asking a question",
  other: "Other",
};

/** What the AI extracts from a pasted message (every candidate field editable client-side). */
export interface InboundExtractedDTO {
  name: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  credential: string | null;
  licenseState: string | null;
  city: string | null;
  state: string | null;
  yearsExp: number | null;
  settingPreference: string | null;
  populationPreference: string | null;
  telehealthPreference: string | null;
  rateExpectation: string | null;
  availability: string | null;
  intent: InboundIntent;
  summary: string;
}

/** One client match, scored on the legacy additive scale (state 25 · cred 25 · setting 10 · pop 10). */
export interface InboundClientMatchDTO {
  clientId: string;
  clientName: string;
  score: number;
  reasons: string[];
}

/** A possible EXISTING person for the extracted contact — the dedupe legacy lacked (plan 2.8). */
export interface InboundExistingDTO {
  kind: "lead" | "candidate";
  id: string;
  name: string;
  matchedOn: "email" | "name";
}

/** The `POST /api/inbound/triage` response. */
export interface TriageResultDTO {
  extracted: InboundExtractedDTO;
  clientMatches: InboundClientMatchDTO[];
  existing: InboundExistingDTO | null;
}

export const triageSchema = z
  .object({
    messageText: z.string().trim().min(10).max(8000),
    context: z.string().trim().max(500).nullish(),
  })
  .strict();
export type TriageInput = z.infer<typeof triageSchema>;

/** `POST /api/inbound/save` — create the Hot lead from the (possibly edited) extraction. */
export const saveInboundLeadSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(200).nullish(),
    phone: z.string().trim().max(50).nullish(),
    linkedinUrl: z.string().trim().url().max(500).nullish(),
    credential: z.string().trim().max(120).nullish(),
    state: z.string().trim().max(60).nullish(),
    clientId: z.string().min(1).nullish(),
    summary: z.string().trim().max(2000).nullish(),
    /** The pasted message — stored (truncated) as the lead's first outreach response. */
    message: z.string().trim().min(1).max(8000),
  })
  .strict();
export type SaveInboundLeadInput = z.infer<typeof saveInboundLeadSchema>;

/** `POST /api/inbound/attach` — the reply belongs to an EXISTING lead: log it + mark Hot. */
export const attachInboundSchema = z
  .object({
    leadId: z.string().min(1),
    message: z.string().trim().min(1).max(8000),
  })
  .strict();
export type AttachInboundInput = z.infer<typeof attachInboundSchema>;
