# Wave 1.2 — Parse Résumé (Module 8) Design

**Status:** design (architect). Backend implements the Prisma model + migration + service/route/tests
from this spec. Design only — no implementation, no migration in this doc. Conforms to `DECISIONS.md`
(wins on conflict), `DATA-MODEL.md`, `STACK-ARCHITECTURE.md`, `CONVENTIONS.md`, `MODULE-BREAKDOWN.md`
(Module 8), `IMPLEMENTATION-PLAN.md` §1.2, the Wave 1.1 candidate build
(`candidate.service.ts` / `candidate.dto.ts` / `candidate.repository.ts`), `src/lib/constants/*`, and
the shared HTTP / auth / audit infra (`api-handler.ts`, `guards.ts`, `audit.ts`).

**Feature:** upload a résumé PDF → client-side pdf.js text extraction → Claude structured extraction →
inline-editable review UI (3 role layouts) → save to a Candidate, with a **confidence-gated
résumé→profile match** that NEVER silently attaches to an existing candidate below threshold. Brings the
`documents` table deferred from Wave 1.1 (D-2).

We replace legacy **Gemini** (`handleExtractResume_`, Code.gs ~2076 + prompt/schema ~3125–3260) with
**Claude via `@anthropic-ai/sdk`**, preserving the extraction schema fields, the 3 role variants, and the
`verificationLine` intent. UI ports `legacy/index.html` ~3170–3620 (pdf.js, role picker, contentEditable
review, 3 layouts) 1:1.

---

## Headline decisions

| # | Decision |
|---|----------|
| **S-1** | **`documents` table lands in 1.2** (metadata + text + structured JSON). Collapses legacy `ResumeFileID/URL/Filename`. |
| **S-2** | **Defer physical PDF storage to Wave 6.** In 1.2 persist only **metadata + client-extracted text + captured structured JSON**; store **no binary bytes**. `storageKey` is nullable and stays null until Wave 6 wires the Supabase Storage bucket. Rationale below. |
| **S-3** | **Provider-agnostic LLM layer** (updated per owner directive — support Claude / OpenAI / Gemini / others, not Claude-only). The model is an `AI_MODEL` `"provider/model"` config string (default `anthropic/claude-opus-4-8`; e.g. `openai/gpt-5`, `google/gemini-2.5-pro`) — swap providers with ONE env var, **no code change**. Implemented via the **Vercel AI SDK** (`ai` + `@ai-sdk/anthropic` / `@ai-sdk/openai` / `@ai-sdk/google`). Downstream code depends only on the zod contract, never the provider. `resumeExtractionEnabled` = the configured provider's key is present. |
| **S-4** | **Structured outputs, not prompt-parse.** `generateObject({ model, schema, system, prompt })` with the zod schema — zod validates before anything is persisted, across every provider. No `JSON.parse(raw)` + fence-stripping. |
| **S-5** | **Text-mode is the contract.** Endpoint consumes pdf.js-extracted text (matches §1.2 done-when). Vision (PDF `document` block) is a documented fallback for low-text/scanned PDFs — open question OQ-3. |
| **S-6** | **Key-agnostic feature flag.** `resumeExtractionEnabled = Boolean(process.env.ANTHROPIC_API_KEY)` mirrors `googleEnabled`. Route exists always; a live call with no key → clean `AppError("FEATURE_DISABLED", 503)`. |
| **S-7** | **Match contract:** email-primary exact → **auto-suggest** (pre-selected, user still accepts); name-only/fuzzy → **`confirm` required**; the save path never sets `candidateId` from a below-threshold match unless the request echoes an explicit `confirmedCandidateId`, re-validated server-side. |

---

## 1. `documents` table (Prisma model spec)

Backend writes the final schema + migration. This wave also adds the back-relation `documents Document[]`
to the existing `Candidate` model (a small additive migration).

```prisma
model Document {
  id               String    @id @default(cuid())
  legacyId         String?   @unique          // ETL upsert (legacy ResumeFileID)

  // ownership — NULLABLE: a doc can exist pre-match (uploaded, not yet attached)
  candidateId      String?
  candidate        Candidate? @relation(fields: [candidateId], references: [id], onDelete: Cascade)

  // classification
  type             String    @default("resume") // validate vs DOCUMENT_TYPES (resume|license|other)
  originalFilename String
  mimeType         String                       // "application/pdf" etc.
  sizeBytes        Int?

  // storage references (S-2)
  storageKey       String?                      // Supabase object path — NULL until Wave 6
  legacyUrl        String?                      // legacy Google Drive URL, carried at ETL

  // captured extraction (SENSITIVE — see §3)
  extractedText    String?                      // pdf.js text the endpoint consumed
  extractedData    Json?                        // full structured résumé (snapshot, licensure, NPI/DEA, bullets…)

  // lifecycle
  uploadedById     String?                      // actor id string (mirrors D-9)
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  deletedAt        DateTime?
  deletedById      String?

  @@index([candidateId])
  @@index([deletedAt])
  @@index([type])
  @@map("documents")
}
```

- **`onDelete: Cascade`** (candidate → documents): a résumé is pure candidate PII/PHI. When a candidate is
  **hard-purged** (Wave 2.5), their documents must go with them — no orphaned résumé PII. (Contrast Wave 1.1
  `Candidate.client` = `SetNull`; clients aren't PII, candidates own their docs.) Soft-delete of a candidate
  leaves documents in place (they're filtered via the same default-exclude extension when listed through the
  candidate).
- **Soft-delete** on documents mirrors the candidate pattern (default-exclude `deletedAt IS NULL`).
- New constant **`DOCUMENT_TYPES = ["resume","license","other"] as const`** in
  `src/lib/constants/candidate.ts` (or a new `documents.ts`), validated in zod, stored as `String`
  (vocab-out-of-migrations convention).

---

## 2. File-storage decision (S-2, justified)

**Recommendation: store metadata + extracted text + structured JSON now; defer physical PDF bytes to Wave 6.**

Why not upload to a Supabase Storage bucket in 1.2:
1. **pdf.js already gives us everything 1.2 needs** — the extracted text (for Claude) and the structured
   profile JSON (for the 3 render layouts and the saved Candidate). The raw bytes are not required to
   complete the §1.2 done-when.
2. **Raw résumés are the heaviest PII/PHI surface in the app** (names, emails, phones, license numbers, NPI,
   DEA, employment history). Persisting bytes at rest opens a hardening scope — private-bucket setup,
   server-signed URL access (Better Auth means **no Supabase RLS**, per DECISIONS — access control is
   app-layer only), at-rest encryption, retention/purge on candidate delete. That belongs in the dedicated
   documents/file wave (Wave 6), not bolted onto 1.2.
3. **Forward-compatible, no future migration:** `storageKey` is nullable now; Wave 6 backfills the bucket
   path without a schema change. `legacyUrl` preserves the legacy Google Drive pointer carried by the ETL
   (1.3/1.4) so no historical résumé link is lost at cutover.

Trade-off (accepted, vetoable — OQ-1): until Wave 6, the app has the extracted text/JSON but not a
re-downloadable original PDF for docs created via the new flow. Legacy docs keep their Drive URL. If the
Owner needs original-PDF retention **now**, the alternative is a private Supabase bucket + server-signed
URLs in 1.2 (schema is already ready) — flagged as OQ-1.

---

## 3. PII / PHI handling

`extractedData` and `extractedText` hold the **most sensitive fields in the system** — `licenseNumber`,
`npi`, `dea`, plus full contact + employment PII. Handling mirrors the Wave 1.1 `licenseNumber` rule:

- **DTO is the boundary.** A `toDocumentDTO(row, viewer)` omits `extractedData` (and any license-number
  fields inside it) unless `hasCapability(viewer.role, "viewCredentials")`. `extractedText`/`extractedData`
  never reach an unauthorized viewer.
- **Encrypt at rest** (app-layer, pgcrypto/envelope — same mechanism specified for `licenseNumber` in
  DECISIONS) for `extractedData`/`extractedText`, since they contain license/NPI/DEA.
- **Never logged.** The extraction service and route must never `console.log` the text, the structured
  output, or the Claude request/response body. `apiHandler` already guarantees raw errors/bodies aren't
  leaked; extend that discipline to the AI layer.
- **Audit:** persisting a document / attaching to a candidate calls `writeAudit(tx, …)` inside the same
  transaction (entity `"document"`, action `create`/`attach`). `before/after` snapshots stay capability-gated
  (`viewAuditLog`).

---

## 4. Extraction contract — `server/ai/parse-resume`

Lives under `src/server/ai/` (all LLM calls server-side, server-held key — STACK §13). `import "server-only"`.

### 4.1 Input

```ts
export interface ParseResumeInput {
  variant: ResumeVariant;   // "clinical" | "prescriber" | "operations"  (the role picker)
  text: string;             // pdf.js-extracted résumé text (client-side)
  // vision fallback (OQ-3): optional base64 PDF for scanned/low-text résumés
  pdfBase64?: string;
}
```

`ResumeVariant` is a new const `RESUME_VARIANTS = ["clinical","prescriber","operations"] as const` in
`lib/constants`. **Distinct from the app `Role` enum** (Owner/Director/…): this is the résumé layout/track
selector. `variant` maps to Candidate `track`: clinical→`Clinical`, prescriber→`Prescriber`,
operations→`Operations`.

### 4.2 Output — zod schema (ports the legacy JSON schema)

One zod schema per concern (STACK), shared client/server. Common base + role-specific extensions, mirroring
`RESUME_COMMON_BASE_()` / `ROLE_SCHEMAS_()`.

```ts
// common to all 3 variants (ported from RESUME_COMMON_BASE_)
const HomeBase = z.object({ city: z.string(), stateOrCountry: z.string(), timezone: z.string() });
const ExperienceItem = z.object({
  title: z.string(), dates: z.string(), employer: z.string(), setting: z.string(),
  location: z.string(), contextLine: z.string(), bullets: z.array(z.string()),
});
const EducationItem = z.object({
  degree: z.string(), school: z.string(), location: z.string(), year: z.string(), honor: z.string(),
});
const ResumeCommon = z.object({
  name: z.string(),
  headerRole: z.string(),
  email: z.string(),
  phone: z.string(),
  homeBase: HomeBase,
  workMode: z.string(),
  targetStart: z.string(),
  snapshot: z.string(),           // sales-grade 3–4 sentence paragraph, no invented achievements
  verificationLine: z.string(),   // SOURCES to check — never "verified by Desta Health" (see §4.4)
  experience: z.array(ExperienceItem),
  education: z.array(EducationItem),
});

const Licensure = z.object({
  type: z.string(), state: z.string(), number: z.string(), status: z.string(), expires: z.string(),
});

// clinical
const ClinicalResume = ResumeCommon.extend({
  licensure: z.array(Licensure),
  npi: z.string(),
  caqhAttestedDate: z.string(),
  skills: z.object({ modalities: z.array(z.string()), populations: z.array(z.string()) }),
});
// prescriber — adds board certs, DEA, hospital affiliations, publications
const PrescriberResume = ResumeCommon.extend({
  licensure: z.array(Licensure),
  boardCertifications: z.array(z.string()),
  npi: z.string(),
  dea: z.array(z.object({ state: z.string(), number: z.string() })),
  caqhAttestedDate: z.string(),
  hospitalAffiliations: z.array(z.object({
    name: z.string(), role: z.string(), location: z.string(), dates: z.string() })),
  publications: z.array(z.string()),
  skills: z.object({ modalities: z.array(z.string()), populations: z.array(z.string()) }),
});
// operations — no licensure; systems/coverage/English
const OperationsResume = ResumeCommon.extend({
  coverageHours: z.string(),
  englishLevel: z.string(),
  referencesStatus: z.string(),
  systemsTools: z.array(z.string()),
  skills: z.object({ functional: z.array(z.string()) }),
});
```

Use empty-string / empty-array for missing fields (matches the legacy "never invent, use `""`/`[]`"
contract) rather than `.optional()`, so the render layouts and structured-output schema stay simple.
The service selects the schema by `variant` and returns a discriminated result `{ variant, data }`.

> Structured-outputs schema note: `output_config.format` disallows `minLength`/`format`/recursive schemas
> (see claude-api reference). These plain string/array shapes are all supported; the SDK strips any
> unsupported constraint and validates client-side.

### 4.3 The Claude call

```ts
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const client = new Anthropic(); // resolves ANTHROPIC_API_KEY from env

const resp = await client.messages.parse({
  model: RESUME_MODEL,                     // "claude-opus-4-8", pinned in config (S-3)
  max_tokens: 16000,
  thinking: { type: "adaptive" },          // adaptive — do NOT use budget_tokens (400 on 4.8)
  output_config: { effort: "medium", format: zodOutputFormat(schemaForVariant) },
  system: SYSTEM_PROMPT[variant],          // ported from ROLE_PROMPTS_() (§4.4)
  messages: [{ role: "user", content: userContent }],
});
const data = resp.parsed_output;           // null-guard → AppError("EXTRACTION_FAILED")
```

- **Model (S-3):** `claude-opus-4-8`, pinned in a `config` module (STACK: "pin the model id in config, not
  scattered in code"). Volume is recruiter-scale (one résumé at a time), and errors on license #/NPI/DEA are
  wrong-person-PII risks, so accuracy > cost. `RESUME_MODEL` is a single swap point to drop to
  `claude-sonnet-4-6` if volume/cost ever dominates.
- **Adaptive thinking**, `effort: "medium"` — extraction isn't deeply reasoning-heavy, but medical accuracy
  benefits from some deliberation; tune via `effort`, never `budget_tokens`.
- **Structured outputs** (S-4) replace Gemini's `responseMimeType: application/json` + manual fence-strip.
- **`userContent`:** text mode → a single text block (`"SCHEMA-guided extraction. RÉSUMÉ:\n" + text`; cap at
  ~60k chars like legacy). Vision fallback (OQ-3) → `[{type:"document",source:{type:"base64",
  media_type:"application/pdf", data: pdfBase64}}, {type:"text", …}]`.
- **Retries/errors:** the SDK retries 429/5xx with backoff automatically (drop the legacy
  `fetchWithRetry_`). Map typed SDK errors → `AppError`: `AuthenticationError`→`FEATURE_DISABLED`,
  `RateLimitError`→`RATE_LIMITED` (429), null `parsed_output`/refusal→`EXTRACTION_FAILED` (502). Never
  surface raw Claude messages (may echo PII).

### 4.4 System prompt (ported intent, not tech)

Port `ROLE_PROMPTS_()` verbatim in intent: parser for DestaHealth (US mental-health recruiting); return only
schema-conformant data; **never invent** (missing → `""`/`[]`); match employers/dates/numbers/credentials
exactly; snapshot may synthesize 3–4 sentences but only restate what's present; experience bullets may be
tightened but no new achievements, lead with verbs, keep numbers; **`verificationLine` lists SOURCES to
check** (state boards, NPPES, ABPN, references, identity) — never "verified by Desta Health," never claim work
done. Preserve the role-specific guidance: clinical (caseload/modalities/populations, LPC/LCSW/etc., **no**
DEA/hospital/board-certs), prescriber (panel/med-mgmt, ABPN, DEA-per-state, NPI, hospital affiliations,
publications), operations (US payer systems, coverage hours EAT/ET overlap, English level, **no** license/NPI/
DEA). Keep the real state-board names for the `verificationLine` (BHEC/DORA/TMB/DOH…).

Since structured outputs enforce the JSON shape, the prompt drops the "return ONLY valid JSON / no markdown
fences / parseable on first try" plumbing rules — the schema handles them.

### 4.5 Map output → `CandidateCreateInput`

A pure `toCandidateCreateInput(variant, data): CandidateCreateInput` (unit-tested, §7). The extraction is
**richer** than the Candidate columns; the mapper is deliberately lossy onto the Wave 1.1 vocab, and the full
payload is preserved in `documents.extractedData`.

| Candidate field | Source | Notes |
|---|---|---|
| `name` | `data.name` | strip "Dr." if desired (legacy keeps it only for MD/DO/PhD/PsyD) |
| `email` | `data.email` | matching signal (§5) |
| `phone` | `data.phone` | |
| `city` | `data.homeBase.city` | |
| `state` | `data.homeBase.stateOrCountry` | residence, not license state |
| `employer` | `data.experience[0]?.employer` | |
| `track` | from `variant` | clinical→Clinical, prescriber→Prescriber, operations→Operations |
| `credential` | derive from `licensure[0].type` / boardCerts, **mapped onto `CREDENTIALS`** | lossy; unmapped → `"Other"` or null. Operations → null |
| `licenseState` | `licensure[0].state` (drop `"—"`) | prescriber/clinical only |
| `licenseNumber` | `licensure[0].number` | SENSITIVE — encrypted + DTO-gated |
| `licenseStatus` | map `licensure[0].status` → `LICENSE_STATUSES` | default `"Not Verified"` |
| `licenseExpiry` | parse `licensure[0].expires` ("Mon YYYY") → Date | null on unparseable |
| `population` | best of `skills.populations` → `POPULATIONS` | lossy pick; null if none map |
| `setting` | `experience[].setting`/`workMode` → `SETTINGS` | lossy; null if none map |
| `source` | — | not extracted; left null, recruiter sets |
| `yearsExp` | — | not in schema; null (recruiter/edit sets) |

Everything not on Candidate (snapshot, headerRole, verificationLine, experience bullets, education,
boardCertifications, dea, npi, hospitalAffiliations, publications, systemsTools, skills, caqh, coverageHours,
englishLevel) → **`documents.extractedData`** (the rendered profile survives without adding ~20 columns to
Candidate). `create` still forces `NEW_CANDIDATE` (service ignores any status) — extraction never sets stage.

---

## 5. Résumé → profile matching (confidence threshold + manual confirm)

Pure helper `matchResumeToCandidate(extracted, candidateList): ResumeMatch` (unit-tested, §7). Enforces the
**no-silent-wrong-person-merge** invariant from DECISIONS / DATA-MODEL.

```ts
type ResumeMatch =
  | { status: "auto";    candidateId: string; score: number; reason: "email-exact" }
  | { status: "confirm"; candidateId: string; score: number; reason: "name-fuzzy" }
  | { status: "none";    score: 0 };
```

**Signals & thresholds (contract):**
- **Email-primary (high confidence → `auto`):** exact, case-insensitive, trimmed email match against a
  non-deleted candidate ⇒ `status:"auto"`. Consistent with the Wave-1.1 email-primary dedupe (D-8). "Auto" =
  the UI **pre-selects** the match; the user still clicks accept — it is **never** attached without a save
  action.
- **Name-secondary (low confidence → `confirm`):** normalized name similarity (lowercased, whitespace/
  punctuation-collapsed; recommend a simple token-set/Levenshtein ratio ≥ 0.9, tunable constant
  `NAME_MATCH_THRESHOLD`) with **no** email match ⇒ `status:"confirm"`. Requires **explicit user
  confirmation** before attaching.
- **No signal ⇒ `status:"none"`** → save creates a **new** candidate (`candidateId` unset).

**Server-authoritative save invariant:** the save endpoint (§6, `POST /api/resume/save` or reuse
`candidateService.create`+attach) may set `candidateId` **only** when either (a) the recomputed match is
`auto`, or (b) the request carries a `confirmedCandidateId` that the user explicitly confirmed **and** the
server re-runs `matchResumeToCandidate` and finds that id among `auto`/`confirm` candidates. A
below-threshold or absent confirmation **never** attaches — it creates a new candidate. The client is not
trusted; the threshold logic runs server-side.

---

## 6. API routes

All wrapped in `apiHandler`, guarded by `requireUser()` (pipeline work is open to any signed-in user — same
authZ posture as `candidateService`; no special capability). zod-validate the body.

### 6.1 `POST /api/resume/extract`
- Body: `{ variant: ResumeVariant, text: string, pdfBase64?: string }` (zod). `text` min length guard
  (legacy required >50 chars); empty → `AppError("BAD_REQUEST")`.
- **Key-absent (S-6):** `if (!resumeExtractionEnabled) throw new AppError("FEATURE_DISABLED", "Résumé
  extraction is not configured", 503)`. `resumeExtractionEnabled = Boolean(process.env.ANTHROPIC_API_KEY)`,
  exported from the AI config module — mirrors `googleEnabled`. The route/page always exist; only the live
  call is gated. The client can read the flag (via a server-passed prop, like `SignInForm googleEnabled`) to
  disable the extract button + show a configuration hint.
- Success: `json({ variant, data })` (the zod-validated structured résumé + the computed
  `match: ResumeMatch` against the current candidate list, so the UI can render the confirm step). Returns the
  extraction to the client for the review UI; **no** Candidate is written yet.

### 6.2 `POST /api/resume/save` (attach/create)
- Body: `{ variant, data (zod), documentType, originalFilename, mimeType, extractedText,
  confirmedCandidateId? }`.
- Recompute the match server-side (§5 invariant). In one `withTransaction`:
  - if attaching (auto or confirmed): `candidateRepository.update(candidateId, mappedFields)` (or leave
    existing candidate untouched and just attach the doc — OQ-2) ; else `candidateService.create(mapped)` →
    new `NEW_CANDIDATE`.
  - create the `documents` row (`candidateId`, `extractedData: data`, `extractedText`, `type`, filename,
    mime, `uploadedById`).
  - `writeAudit(tx, { entity:"document", action:"create"|"attach", … })`.
- Returns the created/updated candidate DTO (`toCandidateDTO`, PII-gated) + document DTO.

Route error envelope, status mapping, and no-PII-leak all come free from `apiHandler`
(`AppError`→status, `ZodError`→422, unknown→generic 500).

---

## 7. UI approach

`src/app/(app)/resume/` (or a route matching the app's convention), a client component tree. Ports
`legacy/index.html` ~3170–3620 1:1 in behavior.

- **Upload + role picker.** Drag-drop / file input; a 3-card **variant picker** (Clinical / Prescriber /
  Operations — same copy/icons as legacy `ROLES`). Reuse UI primitives (`Field`, `Spinner`,
  `ErrorState`, `EmptyState`, `Skeleton`) and Tailwind tokens; no inline-style port.
- **Client-side pdf.js text extraction.** Load `pdfjs-dist` (add dep); on file select, read as
  `ArrayBuffer`, `getDocument({data}).promise`, concatenate `getTextContent()` per page — the exact legacy
  flow (~3192). POST the text (+ `variant`) to `/api/resume/extract`. (Keep the base64 around only if the
  vision fallback OQ-3 is enabled.) This keeps heavy PDF parsing off the server and matches §1.2.
- **Inline-editable review form.** Port the `contentEditable` review (legacy `Ed`/`EdList`/`updateP`) to
  **react-hook-form + zod** (`useZodForm`) over the same résumé schema — a controlled form instead of
  `contentEditable` (fixes the legacy "blur-clobbers-unsaved-edits" gotcha and the deep-clone-on-every-blur
  cost). Reuse `Field` for labeled controls; arrays (experience bullets, licensure rows, DEA, systems) render
  as editable lists. Note: legacy had **no add/remove-row UI** — recommend adding minimal add/remove for
  arrays (small scope, closes a known legacy gap) — OQ-4.
- **3 role layouts.** Port the render helpers (brand header, name block, snapshot, licensure table,
  systems/tools, hospital affiliations, experience, education, publications, skills, pills, `verificationLine`)
  as `ClinicalLayout` / `PrescriberLayout` / `OperationsLayout` components sharing common sub-components,
  driven by `variant`.
- **Match-confirm step.** After extract, if `match.status === "auto"` show "Looks like **[name]** already in
  the pipeline — attach to them?" pre-selected; if `"confirm"`, show the candidate but **require an explicit
  toggle** ("This is the same person") before the save button will attach; if `"none"`, default to "Create new
  candidate." The save button posts to `/api/resume/save` with `confirmedCandidateId` only when the user
  confirmed.
- **a11y:** `Field` already wires `aria-describedby`/`role="alert"`; the variant picker is a radio group
  (`role="radiogroup"`, arrow-key nav, visible focus); drop-zone has a keyboard-accessible file input; the
  confirm toggle is a labeled checkbox; the match banner is `role="status"`.

---

## 8. Tests (mock the SDK — never call real Claude)

- **`toCandidateCreateInput` mapping** (pure): each variant → correct `track`; credential/setting/population
  mapping onto the constant vocab incl. the unmapped→`Other`/null cases; license status/expiry parsing;
  operations → no license fields; rich fields land in `extractedData`, not on Candidate; `status` never set
  (create forces `NEW_CANDIDATE`).
- **`matchResumeToCandidate` threshold logic** (pure) — the critical safety tests:
  - email exact (case/whitespace-insensitive) → `auto`;
  - name-fuzzy, no email → `confirm`;
  - **below threshold / name-only weak → `none` (no silent attach)** — the explicit
    no-wrong-person-merge case;
  - save path: a `confirmedCandidateId` that the server re-match does **not** classify `auto`/`confirm` is
    rejected (attach refused → new candidate).
- **Route** (`resume/extract`): unauth → 401; **key-absent → `FEATURE_DISABLED` 503**; empty/short text →
  422/BAD_REQUEST; happy path with a **mocked `@anthropic-ai/sdk`** (`messages.parse` returns fixture
  `parsed_output`) → 200 with validated `{variant,data,match}`; null `parsed_output` → `EXTRACTION_FAILED`.
- **Extraction service** with mocked SDK: correct schema selected per variant; SDK typed errors map to the
  right `AppError`; **no PII in logs** (assert the logger is never called with text/data).
- **Save route** with mocked SDK + repo: attach-on-auto, attach-on-confirm, create-on-none; audit written in
  the same transaction.

---

## 9. Open questions / assumptions (vetoable)

- **OQ-1 (storage):** Assume physical PDF bytes deferred to Wave 6 (S-2). **Veto** if the Owner requires
  re-downloadable original résumés now → provision a private Supabase bucket + server-signed URLs in 1.2
  (schema is already ready via `storageKey`).
- **OQ-2 (attach semantics):** On an `auto`/confirmed match, does save **overwrite** the existing candidate's
  fields with the freshly extracted ones, or only attach the document and leave candidate data as-is?
  Assumption: **attach the document + fill only empty candidate fields** (no destructive overwrite of
  human-edited data), consistent with the "keep-newest + flag, no silent overwrite" merge policy. Confirm.
- **OQ-3 (vision fallback):** Assume **text-mode is the shipped contract** (§1.2 done-when). Legacy *preferred*
  vision because Gemini read PDFs better than pdf.js text. Claude reads PDFs well too. Recommend shipping
  text-mode 1.2 and adding the `document`-block vision path as a fast-follow for scanned/low-text résumés
  (schema/route already accept `pdfBase64`). Confirm whether vision is in-scope for 1.2 or deferred.
- **OQ-4 (array editing):** Legacy had no add/remove-row UI; assumption is to add minimal add/remove for the
  editable arrays. Confirm it's in scope (small) vs strict 1:1 port.
- **OQ-5 (model/cost):** Assume Opus 4.8 (S-3). If the Owner wants the cheaper tier by default, flip
  `RESUME_MODEL` to `claude-sonnet-4-6` (structured outputs supported there too) — single config change.
- **Backend assumption (legacy):** the legacy extraction behavior is reconstructed from `Code.gs`
  (`ROLE_SCHEMAS_`/`ROLE_PROMPTS_`) — treated as source of truth for fields/prompt intent; no live Gemini
  behavior needs re-verification since we replace it wholesale with Claude.
```
