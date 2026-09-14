/**
 * Template token engine (Wave 4.1, legacy `index.html:3685-3717`) — PURE + ISOMORPHIC (no
 * `server-only`). Sequential `{token}` regex replaces, same order as legacy (order isn't currently
 * load-bearing since no replacement value re-introduces `{...}` syntax, but preserved anyway —
 * legacy's own docs flag it as a gotcha). `{today}` is the one token beyond legacy's literal set —
 * see `lib/constants/templates.ts`'s header comment for why.
 */

export interface TemplateRecipient {
  name: string;
  credential: string | null;
  licenseState: string | null;
  licenseNumber: string | null;
  licenseStatus: string | null;
  npi: string | null;
  yearsExp: number | null;
  specialty: string | null;
  employer: string | null;
  population: string | null;
  setting: string | null;
  telehealthPref: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
  targetLocations: string | null;
}

export interface TemplateFillContext {
  /** `null` = no candidate/lead selected yet — every token falls back to its bracket placeholder. */
  recipient: TemplateRecipient | null;
  /** Drives {client}/{clientDesc}/{clientContact}/{highlights} — the raw selected client name,
   *  NOT `recipient`'s own client (legacy: `{client}` uses `tClient`, never `cand.Client`). */
  clientName: string;
  clientDesc: string;
  clientContact: string;
  clientHighlights: string;
  /** {recruiter} — the acting user's display name. */
  recruiterName: string;
  /** {today} — see module header comment. Injected by the caller so this stays pure (no `new Date()`
   *  inside a rules file, matching this app's "server always recomputes" isomorphic-purity norm). */
  today: string;
}

export function fillTemplate(text: string, ctx: TemplateFillContext): string {
  const r = ctx.recipient;
  let t = text;
  t = t.replace(/\{name\}/g, r ? r.name : "[Candidate Name]");
  t = t.replace(/\{credential\}/g, r ? (r.credential ?? "[Credential]") : "[Credential]");
  t = t.replace(/\{licenseState\}/g, r ? (r.licenseState ?? "[State]") : "[State]");
  t = t.replace(/\{licenseNumber\}/g, r ? (r.licenseNumber ?? "[License #]") : "[License #]");
  t = t.replace(/\{licenseStatus\}/g, r ? (r.licenseStatus ?? "Not Verified") : "[License Status]");
  t = t.replace(/\{npi\}/g, r ? (r.npi ?? "[NPI]") : "[NPI]");
  t = t.replace(/\{yearsExp\}/g, r ? String(r.yearsExp ?? "[Years]") : "[Years]");
  t = t.replace(/\{specialty\}/g, r ? (r.specialty ?? "[Specialty]") : "[Specialty]");
  t = t.replace(/\{employer\}/g, r ? (r.employer ?? "[Current Employer]") : "[Current Employer]");
  t = t.replace(/\{population\}/g, r ? (r.population ?? "[Population]") : "[Population]");
  t = t.replace(/\{setting\}/g, r ? (r.setting ?? "[Setting]") : "[Setting]");
  t = t.replace(
    /\{telehealth\}/g,
    r ? (r.telehealthPref ?? "[Telehealth Pref]") : "[Telehealth Pref]",
  );
  t = t.replace(/\{city\}/g, r ? (r.city ?? "[City]") : "[City]");
  t = t.replace(/\{email\}/g, r ? (r.email ?? "[Email]") : "[Email]");
  t = t.replace(/\{phone\}/g, r ? (r.phone ?? "[Phone]") : "[Phone]");
  t = t.replace(/\{schedule\}/g, "[Schedule/Availability]");
  t = t.replace(/\{matchNotes\}/g, "[Why this candidate fits this client]");
  t = t.replace(/\{count\}/g, "[#]");
  t = t.replace(/\{client\}/g, ctx.clientName);
  t = t.replace(/\{clientDesc\}/g, ctx.clientDesc);
  t = t.replace(/\{clientContact\}/g, ctx.clientContact);
  t = t.replace(/\{role\}/g, r ? (r.credential ?? "[Role]") : "[Role]");
  t = t.replace(/\{location\}/g, r && r.licenseState ? " in " + r.licenseState : "");
  t = t.replace(
    /\{targetLocations\}/g,
    r ? (r.targetLocations ?? "[Target Locations]") : "[Target Locations]",
  );
  t = t.replace(/\{highlights\}/g, ctx.clientHighlights);
  t = t.replace(/\{recruiter\}/g, ctx.recruiterName);
  t = t.replace(/\{slot1\}/g, "[Day/Time Option 1]");
  t = t.replace(/\{slot2\}/g, "[Day/Time Option 2]");
  t = t.replace(/\{slot3\}/g, "[Day/Time Option 3]");
  t = t.replace(/\{deadline\}/g, "[Deadline Date]");
  t = t.replace(/\{referencesStatus\}/g, "[Pending/Collected]");
  t = t.replace(/\{bgStatus\}/g, "[Clear/Pending/Flagged]");
  t = t.replace(/\{bgDate\}/g, "[Date]");
  t = t.replace(/\{today\}/g, ctx.today);
  return t;
}
