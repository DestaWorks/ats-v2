/**
 * Legacy row → Candidate upsert plan (Wave 1.3, §2). PURE (no `server-only`, no DB — only
 * `import type { Prisma }`, erased at runtime) so it unit-tests cleanly. Consumes the Wave 1.1
 * field-mapping table and produces the `upsertByLegacyId` create/update inputs plus flags/errors/
 * notes and a planned `action`. The service layer resolves add-vs-update (needs the DB) and runs
 * the email dedupe pass (also here, pure).
 *
 * SECURITY: `licenseNumber`/email/name are PII — carried in the plan but the report (built in the
 * service) exposes only the name; nothing here logs.
 */
import type { Prisma } from "@/generated/prisma/client";
import {
  CREDENTIALS,
  DEFAULT_TRACK,
  LICENSE_STATUSES,
  POPULATIONS,
  SETTINGS,
  SOURCES,
  TAGS,
  TRACKS,
  US_STATES,
  fromLegacyStatusLabel,
  statusOrder,
} from "@/lib/constants";
import type { ImportAction, EmailDuplicateGroup } from "@/lib/validation/migration";
import type { LegacyRow } from "./sheet-parse";

/** A résumé document to upsert alongside the candidate, keyed deterministically by legacy id (§5). */
export interface DocumentUpsertPlan {
  /** ResumeFileID, or a derived `resume:<legacyId>` when only URL/filename are present. */
  legacyId: string;
  legacyUrl: string | null;
  originalFilename: string;
  type: "resume";
  mimeType: string;
}

/** The full transform output for one row — richer than the report; the service maps it down. */
export interface ImportRowPlan {
  legacyId: string;
  rowNumber: number;
  name: string;
  /** Lowercased/trimmed, for email dedupe only (store original case on the candidate). */
  normalizedEmail: string | null;
  /** Keep-newest key for the dedupe primary. */
  updatedAt: Date | null;
  createdAt: Date | null;
  create: Prisma.CandidateUncheckedCreateInput;
  update: Prisma.CandidateUncheckedUpdateInput;
  document?: DocumentUpsertPlan;
  /** Non-blocking, surfaces in the report (unknown-client, email-duplicate). */
  flags: string[];
  /** Blocking → excluded from commit (unrecognized-status, missing-id, missing-name). */
  errors: string[];
  /** Non-blocking notes (unmapped-credential, unparseable-license-expiry, …). */
  notes: string[];
  /** Legacy row carries a DeletedAt → imports soft-deleted (to Trash). */
  softDeleted: boolean;
  action: ImportAction;
}

// --- tolerant scalar parsers (unit-tested; validated later via the prepare preview) ----------

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/** Parse a legacy date: ISO-8601, `M/D/YYYY`, or `Mon YYYY`. Unparseable/empty → null. */
export function parseLegacyDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;

  const mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (mdy) {
    const dt = new Date(Date.UTC(Number(mdy[3]), Number(mdy[1]) - 1, Number(mdy[2])));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const monYear = /^([A-Za-z]{3,})\.?\s+(\d{4})$/.exec(s);
  if (monYear) {
    const month = MONTHS[monYear[1]!.slice(0, 3).toLowerCase()];
    if (month === undefined) return null;
    return new Date(Date.UTC(Number(monYear[2]), month, 1));
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const dt = new Date(s);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  return null;
}

/** Parse a legacy integer (truncates decimals). Empty/non-numeric → null. */
export function parseLegacyInt(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** Tolerant boolean: true/yes/1/✓ (case-insensitive) → true; everything else → false. */
export function parseLegacyBool(raw: string): boolean {
  return ["true", "yes", "1", "✓", "y"].includes(raw.trim().toLowerCase());
}

/** Case-insensitive exact match against a fixed vocab. Empty → null (no note); unmapped → null + flag. */
export function mapToVocab(
  value: string,
  vocab: readonly string[],
): { value: string | null; unmapped: boolean } {
  const s = value.trim();
  if (!s) return { value: null, unmapped: false };
  const hit = vocab.find((v) => v.toLowerCase() === s.toLowerCase());
  return hit ? { value: hit, unmapped: false } : { value: null, unmapped: true };
}

/** Normalize a client name/legacyId for the case-insensitive resolution index (§3). */
export function normalizeClientKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

const NEEDS_REVIEW_TAG = "Needs Review";

// --- transform -------------------------------------------------------------------------------

/**
 * Transform one normalized legacy row into an `ImportRowPlan`. `clientsByName` maps
 * `normalizeClientKey(name|legacyId) → clientId` (built once by the service from the seeded
 * clients). The planned `action` here is `error`/`softDelete`/`add`; the service flips `add→update`
 * when the legacy id already exists in the DB.
 */
export function transformRow(
  row: LegacyRow,
  rowNumber: number,
  clientsByName: Map<string, string>,
): ImportRowPlan {
  const flags: string[] = [];
  const errors: string[] = [];
  const notes: string[] = [];

  const legacyId = row.ID.trim();
  const name = row.Name.trim();
  if (!legacyId) errors.push("missing-id");
  if (!name) errors.push("missing-name");

  // Status drives stageOrder/gates/funnels — an unrecognized label is an ERROR, never guessed (E-6).
  const status = fromLegacyStatusLabel(row.Status);
  if (!status) errors.push("unrecognized-status");

  const credential = mapToVocab(row.Credential, CREDENTIALS);
  if (credential.unmapped) notes.push("unmapped-credential");
  const population = mapToVocab(row.Population, POPULATIONS);
  if (population.unmapped) notes.push("unmapped-population");
  const setting = mapToVocab(row.Setting, SETTINGS);
  if (setting.unmapped) notes.push("unmapped-setting");
  const source = mapToVocab(row.Source, SOURCES);
  if (source.unmapped) notes.push("unmapped-source");
  const licenseStatus = mapToVocab(row.LicenseStatus, LICENSE_STATUSES);
  if (licenseStatus.unmapped) notes.push("unmapped-license-status");

  let licenseState: string | null = null;
  const rawLicenseState = row.LicenseState.trim().toUpperCase();
  if (rawLicenseState) {
    if ((US_STATES as readonly string[]).includes(rawLicenseState)) licenseState = rawLicenseState;
    else notes.push("unmapped-license-state");
  }

  const trackMap = mapToVocab(row.Track, TRACKS);
  const track = trackMap.value ?? DEFAULT_TRACK;
  if (trackMap.unmapped) notes.push("unmapped-track");

  const tags = new Set<string>();
  for (const raw of row.Tags.split(/[;,]/)) {
    const t = raw.trim();
    if (!t) continue;
    const mapped = mapToVocab(t, TAGS);
    if (mapped.value) tags.add(mapped.value);
    else notes.push("unmapped-tag");
  }
  // D-4: TelehealthPref is dropped as a column; a truthy value becomes a `Telehealth Only` tag.
  if (parseLegacyBool(row.TelehealthPref)) tags.add("Telehealth Only");

  let clientId: string | null = null;
  const clientName = row.Client.trim();
  if (clientName) {
    const hit = clientsByName.get(normalizeClientKey(clientName));
    if (hit) clientId = hit;
    else flags.push("unknown-client"); // never auto-create (E-3)
  }

  const licenseExpiry = parseLegacyDate(row.LicenseExpiry);
  if (row.LicenseExpiry.trim() && !licenseExpiry) notes.push("unparseable-license-expiry");
  const licenseVerifiedAt = parseLegacyDate(row.LicenseVerifiedAt);
  if (row.LicenseVerifiedAt.trim() && !licenseVerifiedAt)
    notes.push("unparseable-license-verified-at");
  const createdAt = parseLegacyDate(row.AddedAt);
  const updatedAt = parseLegacyDate(row.UpdatedAt);
  const deletedAt = parseLegacyDate(row.DeletedAt);

  const yearsExp = parseLegacyInt(row.YearsExp);
  if (row.YearsExp.trim() && yearsExp === null) notes.push("unmapped-years-exp");
  const outreachAttempts = parseLegacyInt(row.OutreachAttempts) ?? 0;

  const email = row.Email.trim();
  const normalizedEmail = email ? email.toLowerCase() : null;

  const stageOrder = status ? statusOrder(status) : 0;
  const stageEnteredAt = updatedAt ?? createdAt ?? null; // proxy — legacy has no per-stage timestamp
  const placedAt = status === "STARTED_DAY1" ? (updatedAt ?? createdAt ?? null) : null;
  const softDeleted = deletedAt !== null;

  const create: Prisma.CandidateUncheckedCreateInput = {
    name,
    email: email || null,
    phone: row.Phone.trim() || null,
    city: row.City.trim() || null,
    state: row.State.trim() || null,
    employer: row.Employer.trim() || null,
    yearsExp,
    credential: credential.value,
    population: population.value,
    setting: setting.value,
    track,
    source: source.value,
    tags: [...tags],
    outreachAttempts,
    licenseState,
    licenseNumber: row.LicenseNumber.trim() || null,
    licenseStatus: licenseStatus.value ?? "Not Verified",
    licenseExpiry,
    licenseVerifiedAt,
    licenseVerifiedById: row.LicenseVerifiedBy.trim() || null,
    status: status ?? "NEW_CANDIDATE",
    stageOrder,
    ...(stageEnteredAt ? { stageEnteredAt } : {}),
    placedAt,
    clientId,
    createdById: row.AddedBy.trim() || null,
    ...(createdAt ? { createdAt } : {}),
    deletedAt,
    deletedById: softDeleted ? row.DeletedBy.trim() || null : null,
  };

  const update = buildUpdate(create, softDeleted);

  let document: DocumentUpsertPlan | undefined;
  const resumeFileId = row.ResumeFileID.trim();
  const resumeUrl = row.ResumeURL.trim();
  const resumeFilename = row.ResumeFilename.trim();
  if (resumeFileId || resumeUrl || resumeFilename) {
    document = {
      legacyId: resumeFileId || `resume:${legacyId}`,
      legacyUrl: resumeUrl || null,
      originalFilename: resumeFilename || "resume.pdf",
      type: "resume",
      mimeType: "application/pdf", // bytes/text not stored at ETL (OQ-6)
    };
  }

  const action: ImportAction = errors.length > 0 ? "error" : softDeleted ? "softDelete" : "add";

  return {
    legacyId,
    rowNumber,
    name,
    normalizedEmail,
    updatedAt,
    createdAt,
    create,
    update,
    document,
    flags,
    errors,
    notes,
    softDeleted,
    action,
  };
}

/**
 * Build the re-run `update` map. A re-run is a **profile delta re-sync** from the Sheet (the source
 * of truth pre-cutover) — it refreshes profile fields (name/contact/credential/license/…) but MUST
 * NOT clobber state the new app owns after import:
 *  - provenance (`createdAt`/`createdById`) — never rewritten;
 *  - **pipeline state** (`status`, `stageOrder`, `stageEnteredAt`, `placedAt`) — a recruiter may have
 *    moved the candidate; a re-import must not reset their stage;
 *  - **`tags`** — humans add tags in-app; a re-import must not replace them;
 *  - soft-delete columns — only written when the legacy row is actually deleted (below), so a
 *    re-import never resurrects a Trash row nor trashes a live one.
 * Null/undefined values are dropped (never null-out an edited field).
 */
function buildUpdate(
  create: Prisma.CandidateUncheckedCreateInput,
  softDeleted: boolean,
): Prisma.CandidateUncheckedUpdateInput {
  const OMIT = new Set([
    "createdAt",
    "createdById",
    "deletedAt",
    "deletedById",
    // new-app-owned — never clobbered by a re-run:
    "status",
    "stageOrder",
    "stageEnteredAt",
    "placedAt",
    "tags",
  ]);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(create)) {
    if (OMIT.has(key) || value === null || value === undefined) continue;
    out[key] = value;
  }
  if (softDeleted) {
    out.deletedAt = create.deletedAt;
    out.deletedById = create.deletedById ?? null;
  }
  return out as Prisma.CandidateUncheckedUpdateInput;
}

// --- email dedupe (pure, §4) -----------------------------------------------------------------

/** Minimal shape of an already-migrated candidate, for cross-run email collision detection. */
export interface ExistingCandidateForDedupe {
  legacyId: string | null;
  email: string | null;
  updatedAt: Date | null;
  createdAt: Date | null;
}

function newest(a: number, b: number): number {
  return b - a;
}
const time = (d: Date | null | undefined) => (d ? d.getTime() : Number.NEGATIVE_INFINITY);

/** Append the `Needs Review` control tag to both the create + update tag arrays (deduped). */
function appendNeedsReview(plan: ImportRowPlan): void {
  const add = (existing: unknown): string[] => {
    const set = new Set(Array.isArray(existing) ? (existing as string[]) : []);
    set.add(NEEDS_REVIEW_TAG);
    return [...set];
  };
  plan.create.tags = add(plan.create.tags);
  plan.update.tags = add(plan.update.tags);
}

/**
 * Two passes over the transformed plans (mutates them in place, §4):
 * 1. **Within-file duplicate legacy id** → later occurrences become `skip` (not a false email-dupe).
 * 2. **Email-primary dedupe** — group by normalized email (blank emails never group), including
 *    already-migrated candidates. A group with >1 DISTINCT legacy id is a collision: every row is
 *    kept (imported by its own legacy id, nothing dropped/merged — D8), flagged `email-duplicate`,
 *    tagged `Needs Review`; the greatest `UpdatedAt` (tie → createdAt → lexical legacyId) is the
 *    reported `keptLegacyId` primary.
 */
export function dedupeByEmail(
  plans: ImportRowPlan[],
  existing: ExistingCandidateForDedupe[] = [],
): EmailDuplicateGroup[] {
  const seenLegacy = new Set<string>();
  for (const p of plans) {
    if (p.action === "error") continue;
    if (seenLegacy.has(p.legacyId)) {
      p.action = "skip";
      p.notes.push("duplicate-legacy-id");
    } else {
      seenLegacy.add(p.legacyId);
    }
  }

  const groups = new Map<
    string,
    { plans: ImportRowPlan[]; existing: ExistingCandidateForDedupe[] }
  >();
  for (const p of plans) {
    if (p.action === "error" || p.action === "skip" || !p.normalizedEmail) continue;
    const g = groups.get(p.normalizedEmail) ?? { plans: [], existing: [] };
    g.plans.push(p);
    groups.set(p.normalizedEmail, g);
  }
  for (const e of existing) {
    if (!e.email) continue;
    groups.get(e.email.trim().toLowerCase())?.existing.push(e);
  }

  const result: EmailDuplicateGroup[] = [];
  for (const [email, g] of groups) {
    const legacyIds = new Set<string>();
    for (const p of g.plans) legacyIds.add(p.legacyId);
    for (const e of g.existing) if (e.legacyId) legacyIds.add(e.legacyId);
    if (legacyIds.size <= 1) continue; // same person by legacy id only — not a collision

    // Only rows with a real legacy id can be the reported `keptLegacyId` primary — an already-
    // migrated DB candidate with a null legacyId must never win it (would yield keptLegacyId: "").
    const contenders = [
      ...g.plans.map((p) => ({
        legacyId: p.legacyId,
        updatedAt: p.updatedAt,
        createdAt: p.createdAt,
      })),
      ...g.existing
        .filter((e): e is ExistingCandidateForDedupe & { legacyId: string } => Boolean(e.legacyId))
        .map((e) => ({ legacyId: e.legacyId, updatedAt: e.updatedAt, createdAt: e.createdAt })),
    ];
    contenders.sort(
      (a, b) =>
        newest(time(a.updatedAt), time(b.updatedAt)) ||
        newest(time(a.createdAt), time(b.createdAt)) ||
        a.legacyId.localeCompare(b.legacyId),
    );

    for (const p of g.plans) {
      p.flags.push("email-duplicate");
      appendNeedsReview(p);
    }
    result.push({ email, legacyIds: [...legacyIds].sort(), keptLegacyId: contenders[0]!.legacyId });
  }
  return result;
}
