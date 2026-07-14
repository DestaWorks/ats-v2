import "server-only";
import { scoreCandidate } from "@/lib/rules/scoring";
import type { ClientRules, RuleCandidate } from "@/lib/rules/types";
import type {
  AttachInboundInput,
  InboundClientMatchDTO,
  InboundExistingDTO,
  InboundExtractedDTO,
  SaveInboundLeadInput,
  TriageInput,
  TriageResultDTO,
} from "@/lib/validation/inbound";
import type { LeadDetailDTO } from "@/lib/validation/lead";
import type { AuthUser } from "@/server/auth/guards";
import { extractInbound } from "@/server/ai/extract-inbound";
import { candidateRepository } from "@/server/repositories/candidate.repository";
import { clientRepository } from "@/server/repositories/client.repository";
import {
  clientRulesRepository,
  toClientRules,
} from "@/server/repositories/client-rules.repository";
import { leadRepository } from "@/server/repositories/lead.repository";
import { leadService } from "./lead.service";

/** Top-N client matches surfaced to the reviewer (legacy showed the top 5 open roles). */
const MAX_CLIENT_MATCHES = 5;
/** The pasted message is stored (truncated) as the lead's first outreach note. */
const MESSAGE_NOTE_MAX = 500;

function truncateMessage(message: string): string {
  return message.length > MESSAGE_NOTE_MAX ? `${message.slice(0, MESSAGE_NOTE_MAX)}…` : message;
}

/**
 * Existing-person lookup — the dedupe legacy `inbound_triage` lacked entirely (plan 2.8 done-when).
 * Email-primary (checked against BOTH live candidates and leads; a candidate match wins since it is
 * further along the pipeline), falling back to a case-insensitive name match against leads only.
 * Returns null when nothing matches — the reviewer proceeds as a fresh Hot lead.
 */
async function findExisting(extracted: InboundExtractedDTO): Promise<InboundExistingDTO | null> {
  if (extracted.email) {
    const [candidates, leads] = await Promise.all([
      candidateRepository.findManyByEmails([extracted.email]),
      leadRepository.findManyByEmails([extracted.email]),
    ]);
    if (candidates[0]) {
      return {
        kind: "candidate",
        id: candidates[0].id,
        name: candidates[0].name,
        matchedOn: "email",
      };
    }
    if (leads[0]) {
      return { kind: "lead", id: leads[0].id, name: leads[0].name, matchedOn: "email" };
    }
  }
  if (extracted.name) {
    const leads = await leadRepository.findManyByNames([extracted.name.trim().toLowerCase()]);
    if (leads[0]) {
      return { kind: "lead", id: leads[0].id, name: leads[0].name, matchedOn: "name" };
    }
  }
  return null;
}

/** Positive-framed match reasons for the reviewer (distinct from `scoreCandidate`'s mismatch flags). */
function matchReasons(
  extracted: InboundExtractedDTO,
  clientName: string,
  rules: ClientRules,
): string[] {
  const reasons: string[] = [];
  if (extracted.licenseState && rules.states.includes(extracted.licenseState)) {
    reasons.push(`Licensed in ${extracted.licenseState}`);
  }
  if (extracted.credential && rules.creds.includes(extracted.credential)) {
    reasons.push(`${extracted.credential} is a fit for ${clientName}`);
  }
  if (extracted.populationPreference && rules.pops.includes(extracted.populationPreference)) {
    reasons.push(`${extracted.populationPreference} population match`);
  }
  if (extracted.settingPreference && rules.settings.includes(extracted.settingPreference)) {
    reasons.push(`${extracted.settingPreference} setting match`);
  }
  return reasons;
}

/**
 * Score the extraction against every client's rules (`client_rules` table, DECISIONS D-data-not-code)
 * via the SAME `scoreCandidate` used for pipeline fit — legacy matched against Open Roles (which
 * don't exist yet, Wave 3.5), so this is the closest equivalent until roles land. Only clients with
 * at least one positive match reason are kept; sorted by fit desc, capped at `MAX_CLIENT_MATCHES`.
 */
async function matchClients(extracted: InboundExtractedDTO): Promise<InboundClientMatchDTO[]> {
  const [clients, rulesRows] = await Promise.all([
    clientRepository.list(),
    clientRulesRepository.list(),
  ]);
  const clientNames = new Map(clients.map((c) => [c.id, c.name]));
  const ruleCandidate: RuleCandidate = {
    status: "NEW_CANDIDATE",
    track: "Clinical",
    credential: extracted.credential,
    licenseState: extracted.licenseState,
    licenseStatus: null,
    population: extracted.populationPreference,
    setting: extracted.settingPreference,
  };

  const matches = rulesRows
    .map((row) => {
      const clientName = clientNames.get(row.clientId);
      if (!clientName) return null;
      const rules = toClientRules(row, clientName);
      const score = scoreCandidate(ruleCandidate, rules);
      const reasons = matchReasons(extracted, clientName, rules);
      if (reasons.length === 0) return null;
      return { clientId: row.clientId, clientName, score: score.pct, reasons };
    })
    .filter((m): m is InboundClientMatchDTO => m !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CLIENT_MATCHES);

  return matches;
}

/**
 * Inbound Triage (Wave 2.8) — replaces the legacy paste-only, AI-only, dedupe-free flow. Owns the
 * extract → dedupe → client-match pipeline and the two save paths (fresh Hot lead / attach to an
 * existing lead). Both save paths compose the existing `leadService` writes (create/logOutreach/
 * respond), so they get the SAME audit trail and lifecycle guards as any other lead action — no
 * duplicated business logic here.
 */
export const inboundService = {
  /** Extract + dedupe + client-match a pasted message. Read-only (no lead is created here). */
  async triage(input: TriageInput): Promise<TriageResultDTO> {
    const extracted = await extractInbound(input.messageText, input.context ?? null);
    const [existing, clientMatches] = await Promise.all([
      findExisting(extracted),
      matchClients(extracted),
    ]);
    return { extracted, clientMatches, existing };
  },

  /**
   * Save the (possibly reviewer-edited) extraction as a fresh Source Lead: create → log the pasted
   * message as the first outreach attempt (channel "other", truncated to 500 chars — legacy parity)
   * → mark Responded Hot. Three `leadService` calls, each independently audited.
   */
  async saveAsLead(input: SaveInboundLeadInput, user: AuthUser): Promise<LeadDetailDTO> {
    const created = await leadService.create(
      {
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        linkedinUrl: input.linkedinUrl ?? null,
        credential: input.credential ?? null,
        state: input.state ?? null,
        source: "Inbound",
        clientId: input.clientId ?? null,
        notes: input.summary ?? null,
      },
      user,
    );
    await leadService.logOutreach(
      created.id,
      { channel: "other", note: `Inbound reply: "${truncateMessage(input.message)}"` },
      user,
    );
    return leadService.respond(created.id, "hot", user);
  },

  /** The reply belongs to an EXISTING lead (dedupe match, reviewer-confirmed): log it, mark Hot. */
  async attach(input: AttachInboundInput, user: AuthUser): Promise<LeadDetailDTO> {
    await leadService.logOutreach(
      input.leadId,
      { channel: "other", note: `Inbound reply: "${truncateMessage(input.message)}"` },
      user,
    );
    return leadService.respond(input.leadId, "hot", user);
  },
};
