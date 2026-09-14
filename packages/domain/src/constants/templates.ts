/**
 * Outreach & workflow template library (Wave 4.1, legacy `index.html:3645-3673`) — DATA, not code,
 * same pattern as `nppes.ts`/`clients.ts`. Legacy templates are hardcoded JS constants with zero
 * admin UI to add/edit/delete them (no `Templates` sheet exists in `Code.gs`); this wave ports the
 * content 1:1, not a template-CRUD feature nobody asked for (see `docs/IMPLEMENTATION-PLAN.md`
 * Wave 4.1 notes). `{token}` placeholders are filled by `lib/rules/fill-template.ts`; the bracket
 * text left inside `present`/`present_batch` bodies (e.g. `[Compensation expectations]`) is
 * template FILLER for the operator to hand-edit, not a token.
 *
 * One addition beyond legacy's literal token set: `{today}` (used only by `nameclear`'s subject).
 * Legacy computed `new Date().toLocaleDateString()` inline in JSX on every render; a module-level
 * constant can't do that (it would freeze at whatever moment the server process last loaded this
 * file), so `{today}` is filled at fill-time by `lib/rules/fill-template.ts` instead — same
 * observable behavior (always shows "today" when previewing/sending), computed correctly.
 */

export const TEMPLATE_CATEGORIES = [
  { id: "outreach", name: "Outreach", icon: "📤" },
  { id: "clearance", name: "Clearance", icon: "🔍" },
  { id: "presentation", name: "Presentation", icon: "📋" },
  { id: "reference", name: "Reference", icon: "📑" },
  { id: "background", name: "Background", icon: "🔒" },
] as const;
export type TemplateCategoryId = (typeof TEMPLATE_CATEGORIES)[number]["id"];

/** `dir`: who the template is addressed to — drives the "→ Candidate" / "→ Client" badge. */
export interface TemplateDef {
  id: string;
  category: TemplateCategoryId;
  name: string;
  dir: "to-candidate" | "to-client";
  subject: string;
  body: string;
}

export const TEMPLATES: readonly TemplateDef[] = [
  // --- outreach ---
  {
    id: "initial",
    category: "outreach",
    name: "Initial Outreach",
    dir: "to-candidate",
    subject: "Exciting Opportunity in Mental Health — {role}",
    body: "Dear {name},\n\nI hope this message finds you well. My name is {recruiter}, and I'm reaching out on behalf of {client}, a {clientDesc}.\n\nWe're currently looking for a {role} to join their team{location}. Based on your background and credentials, I believe this could be an excellent fit.\n\nWould you be open to a brief conversation this week to learn more about the position?\n\nLooking forward to hearing from you.",
  },
  {
    id: "followup1",
    category: "outreach",
    name: "Follow-Up 1",
    dir: "to-candidate",
    subject: "Following Up — {role} Opportunity at {client}",
    body: "Dear {name},\n\nI wanted to follow up on my previous message regarding the {role} opportunity at {client}.\n\nI understand you may be busy, and I wanted to make sure this didn't get lost in your inbox. The position offers {highlights}, and I'd love to share more details at your convenience.\n\nWould a quick 10-minute call work for you this week?",
  },
  {
    id: "followup2",
    category: "outreach",
    name: "Follow-Up 2 (Final)",
    dir: "to-candidate",
    subject: "Final Follow-Up — {role} at {client}",
    body: "Dear {name},\n\nI'm reaching out one more time regarding the {role} position at {client}. I want to respect your time, so this will be my last follow-up on this particular opportunity.\n\nIf you're interested now or in the future, feel free to reach out at any time. I'd be happy to discuss how this role aligns with your career goals.\n\nWishing you all the best.",
  },
  {
    id: "screening",
    category: "outreach",
    name: "Screening Invite",
    dir: "to-candidate",
    subject: "Screening Call — {client}",
    body: "Dear {name},\n\nThank you for your interest in the {role} position at {client}.\n\nI'd like to schedule a brief screening call to discuss the role in more detail and answer any questions.\n\nPlease let me know your availability for a 15-20 minute call on any of the following days:\n\n• {slot1}\n• {slot2}\n• {slot3}",
  },
  // --- clearance ---
  {
    id: "nameclear",
    category: "clearance",
    name: "Name Clearance Request",
    dir: "to-client",
    subject: "Name Clearance — {today}",
    body: "Hi {clientContact},\n\nCould you please provide name clearance for the following candidate(s)?\n\n• {name}, {credential}\n\nThanks,",
  },
  // --- presentation ---
  {
    id: "present",
    category: "presentation",
    name: "Candidate Presentation",
    dir: "to-client",
    subject: "Candidate Presentation — {name}, {credential}",
    body: "Hi {clientContact},\n\nHappy to present {name}, {credential} as a candidate for your {targetLocations} team.\n\nBackground & Experience\n• [Key clinical experience summary]\n• [Relevant specialties / patient populations]\n• [Current role / prior experience]\n• [Notable highlights / differentiators]\n\nTarget Details\n• Schedule: {schedule}\n• Compensation: [Compensation expectations]\n• Location preference: {targetLocations}\n• Transition timeline (if applicable): [Timeline]\n\nAvailability to Connect\n• {slot1}\n• {slot2}\n\nPlease let me know what your availability looks like, and I'll coordinate next steps.\n\nThanks,",
  },
  {
    id: "present_short",
    category: "presentation",
    name: "Quick Presentation",
    dir: "to-client",
    subject: "Candidate — {name}, {credential} ({licenseState})",
    body: "Hi {clientContact},\n\nQuick candidate for {client}:\n\n{name} — {credential}, {licenseState}\n{yearsExp} years experience | {specialty}\nLicense: {licenseStatus} ({licenseNumber})\nSetting: {setting} | Telehealth: {telehealth}\nTarget Location(s): {targetLocations}\n\nResume attached. Let me know if you'd like to proceed.",
  },
  {
    id: "present_batch",
    category: "presentation",
    name: "Batch Presentation (Multiple)",
    dir: "to-client",
    subject: "Candidate Pipeline Update — {client} ({count} candidates)",
    body: "Hi {clientContact},\n\nHere is the current pipeline update for {client}.\n\n━━━━━━━━━━━━━━━━━━━━━━━━━\nCANDIDATE 1\n━━━━━━━━━━━━━━━━━━━━━━━━━\nName: \nCredential: \nLicense: \nYears Exp: \nFit Notes: \n\n━━━━━━━━━━━━━━━━━━━━━━━━━\nCANDIDATE 2\n━━━━━━━━━━━━━━━━━━━━━━━━━\nName: \nCredential: \nLicense: \nYears Exp: \nFit Notes: \n\n━━━━━━━━━━━━━━━━━━━━━━━━━\nCANDIDATE 3\n━━━━━━━━━━━━━━━━━━━━━━━━━\nName: \nCredential: \nLicense: \nYears Exp: \nFit Notes: \n\nConverted resumes attached. Please review and advise on next steps.",
  },
  // --- reference ---
  {
    id: "refreq",
    category: "reference",
    name: "Reference + License Request (to Candidate)",
    dir: "to-candidate",
    subject: "{client} — Next Steps",
    body: "Hi {name},\n\nWe're glad to hear your conversation with [Interviewer Name] went well — they'd like to move forward with next steps.\n\nCould you please provide:\n• A copy of your {credential} license\n• A copy of your driver's license\n\nAdditionally, please share 3 references in the following format:\n• Name\n• Current role and organization\n• Contact info (email + phone)\n• Relationship to you\n\nLet me know if you have any questions.\n\nThanks,",
  },
  {
    id: "refpres",
    category: "reference",
    name: "Reference + License Submission (to Client)",
    dir: "to-client",
    subject: "{name} — References & Licenses",
    body: "Hi {clientContact},\n\nBelow are the reference details for {name}:\n\nReference 1\n• Name:\n• Current Employer:\n• Contact: [Phone] | [Email]\n• Relationship:\n\nReference 2\n• Name:\n• Current Employer:\n• Contact: [Phone] | [Email]\n• Relationship:\n\nReference 3\n• Name:\n• Current Employer:\n• Contact: [Phone] | [Email]\n• Relationship:\n\nI've also attached the candidate's license and driver's license.\n\nPlease let me know if anything further is needed.\n\nBest,",
  },
  // --- background ---
  {
    id: "bgreq",
    category: "background",
    name: "Background Check Info Request (to Candidate)",
    dir: "to-candidate",
    subject: "RE: {client} — Next Steps",
    body: "Hi {name},\n\nGreat news — {client} has connected with your references.\n\nTo move forward, we'll need the following details to complete the background check:\n• Full legal name (including middle name)\n• Date of birth\n• Social Security number\n\nIf you prefer, I'm happy to collect this over a quick call instead.\n\nThanks,",
  },
  {
    id: "bgpres",
    category: "background",
    name: "Background Check Info Submission (to Client)",
    dir: "to-client",
    subject: "RE: {name} — Background Check",
    body: "Hi {clientContact},\n\nBelow is the information for the background check:\n• Full legal name:\n• DOB:\n• SSN:\n• Home address:\n• Email: {email}\n\nBest,",
  },
] as const;

export function templatesByCategory(category: TemplateCategoryId): readonly TemplateDef[] {
  return TEMPLATES.filter((t) => t.category === category);
}

export function findTemplate(id: string): TemplateDef | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

/**
 * Per-client copy for the `{clientDesc}`/`{clientContact}`/`{highlights}` tokens — keyed by exact
 * client name (matches `BASE_CLIENTS[].name` in `clients.ts`). A client not listed here (e.g. "NJ-
 * Psych Candidates", "Future Potential Clients") falls back to generic text, exactly like legacy.
 */
export interface ClientTemplateInfo {
  desc: string;
  highlights: string;
  contactTitle: string;
}

export const CLIENT_TEMPLATE_INFO: Readonly<Record<string, ClientTemplateInfo>> = {
  "Sterling Institute": {
    desc: "mental health practice in Connecticut specializing in child and adolescent psychiatry",
    highlights: "competitive compensation, a hybrid schedule, and a supportive clinical team",
    contactTitle: "Hiring Manager",
  },
  "Contemporary Care": {
    desc: "multi-state mental health practice serving Connecticut, New Jersey, and Florida",
    highlights: "flexible hybrid scheduling across multiple state locations",
    contactTitle: "Practice Manager",
  },
  "DOCs Medical Group": {
    desc: "on-site medical group in Connecticut",
    highlights: "a structured 3×12 schedule with a close-knit clinical team",
    contactTitle: "Office Manager",
  },
  "Ritu Suri & Associates": {
    desc: "outpatient mental health practice",
    highlights: "a collaborative outpatient environment with flexible scheduling",
    contactTitle: "Dr. Ritu Suri",
  },
};

export const CLIENT_TEMPLATE_INFO_FALLBACK: ClientTemplateInfo = {
  desc: "healthcare practice",
  highlights: "competitive compensation and a supportive environment",
  contactTitle: "[Client Contact]",
};

export function clientTemplateInfo(clientName: string): ClientTemplateInfo {
  return CLIENT_TEMPLATE_INFO[clientName] ?? CLIENT_TEMPLATE_INFO_FALLBACK;
}

/** Email-signature presets (legacy `index.html:3810-3835`). `{recruiterName}` is substituted by the UI. */
export const SIGNATURE_PRESETS = [
  {
    id: "destahealth",
    label: "DestaHealth Standard",
    body: (recruiterName: string) =>
      `Best regards,\n\n${recruiterName}\nHealthcare Recruiting Associate\nDestaHealth Recruiting\nbiruh@destahealth.com\nwww.destahealth.com`,
  },
  {
    id: "minimal",
    label: "Minimal",
    body: (recruiterName: string) => `${recruiterName}\nDestaHealth Recruiting`,
  },
] as const;

/** Fallback signature block used whenever no signature is set (legacy `index.html:3719`). */
export function defaultSignature(recruiterName: string): string {
  return `\n\nBest regards,\n${recruiterName}\nHealthcare Recruiting Associate\nDestaHealth Recruiting`;
}
