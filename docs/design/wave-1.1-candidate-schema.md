# Wave 1.1 — Candidate + Client + StageHistory Schema Design

**Status:** design locked (engineer-resolved). Backend implements the Prisma models + migration +
repositories + services + tests from this. Conforms to `DECISIONS.md` (wins on conflict),
`DATA-MODEL.md`, `STACK-ARCHITECTURE.md`, `CONVENTIONS.md`, existing `prisma/schema.prisma`,
`src/lib/constants/*`, and `src/server/rules/*`.

---

## Resolved decisions (engineer's calls on the architect's open questions)

| # | Question | Decision |
|---|----------|----------|
| D-1 | `licenseExpiry` in 1.1 or defer to 3.4? | **Include now** — nullable, indexed. The one-shot ETL (1.4) runs before 3.4; deferring loses legacy expiry data. |
| D-2 | Resume trio (`ResumeFileID/URL/Filename`) | **Defer to a `documents` table created in Wave 1.2 (Parse Resume)**, which lands before ETL (1.4). NOT on the Candidate model. |
| D-3 | `OutreachAttempts` — drop/normalize or keep? | **Keep as `outreachAttempts Int @default(0)` on Candidate** (override the architect's normalize-to-table). It's a cheap denormalized counter, not real duplication, and normalizing to a Wave-2.6 table that doesn't exist yet would strand the value at ETL. Revisit in 2.6 only if needed. |
| D-4 | `TelehealthPref` — drop? | **Drop the column**; at ETL, map legacy `TelehealthPref = true` → append the `Telehealth Only` **tag**. No product behavior lost; removes genuine 3-way duplication (column vs `setting="Telehealth"` vs tag). |
| D-5 | `BASE_CLIENTS` constant missing | **Create `src/lib/constants/clients.ts`** (`BASE_CLIENTS` from DATA-MODEL) and seed `Client` from it. |
| D-6 | `withTransaction` + soft-delete Prisma extension don't exist | **Build both in 1.1** (`server/db/with-transaction.ts` + extend `server/db/prisma.ts`). The repo default soft-delete exclusion and the transactional `move` depend on them. |
| D-7 | `NPI` | **Deferred** to the Discover/NPPES wave (2.7). Not in the legacy 32. |
| D-8 | `email` DB-unique? | **No** — indexed only. Legacy has dupes; dedupe is email-primary **manual-merge (keep-newest + flag)** per DECISIONS; a hard unique breaks ETL. |
| D-9 | Actor fields (`createdById`, `deletedById`, `licenseVerifiedById`, `StageHistory.actorId`) | **`String`, not `User` FKs** — mirrors `activity_log.actor`; legacy actors may not resolve to a `User` row at ETL. Resolve to a display name in the DTO. |
| D-10 | `Candidate.client` onDelete | **`SetNull`** (clients are seeded + soft-deleted, not hard-deleted). |

---

## 0. Design principles
- Status is a **stable code** (`NEW_CANDIDATE`…`FUTURE_PIPELINE`) + numeric `stageOrder` mirror + label lookup — never store the label (`pipeline-status.ts`). Scoring/gates/funnels key off code/ordinal.
- Scoring rules are **data, not columns** (`client_rules`, Wave 3.5/4.2) — NOT in this wave. Only a minimal `Client` (name + capacity) here.
- Vocabulary enums (`credential`, `licenseStatus`, `track`, `source`, `population`, `setting`, `tags`) are **validated in zod** against the `lib/constants` unions but **stored as `String`/`String[]`** (matches `User.role`) — keeps vocab churn out of migrations.
- Cross-cutting columns: `id` (cuid), `createdAt`, `updatedAt`, `createdById`, `deletedAt`/`deletedById`, plus `legacyId` for idempotent ETL upsert.
- `@@map` to lowercase/plural, matching existing convention (`activity_log`, `access_request`).

## 1. Legacy → target field mapping (all 32 columns)

| Legacy | Verdict | Target · type | Notes |
|---|---|---|---|
| ID | rename | `legacyId String? @unique` | new PK is cuid `id`; legacy id kept for ETL upsert |
| Name | keep | `name String` | **PII**, required |
| Credential | keep | `credential String?` | scoring 30 + gate; validate vs `CREDENTIALS` |
| LicenseState | keep | `licenseState String?` | scoring 30 + gate + auto-DQ |
| LicenseNumber | keep | `licenseNumber String?` | **sensitive PII** — DTO-gated (`viewCredentials`) + encrypt at rest |
| LicenseStatus | keep | `licenseStatus String @default("Not Verified")` | scoring 10 + gate + DQ; validate vs `LICENSE_STATUSES` |
| LicenseExpiry | keep (D-1) | `licenseExpiry DateTime?` | indexed; verification queue |
| LicenseVerifiedBy | keep | `licenseVerifiedById String?` | current-verification provenance (history in `activity_log`) |
| LicenseVerifiedAt | keep | `licenseVerifiedAt DateTime?` | " |
| Client | rename→FK | `clientId String?` → `Client` | FK from day one; nullable |
| Source | keep | `source String?` | funnel/source ROI; validate vs `SOURCES` |
| Status | keep+mirror | `status String @default("NEW_CANDIDATE")` + `stageOrder Int @default(0)` | code + ordinal (DECISIONS) |
| Email | keep | `email String?` | **PII**; indexed, not unique (D-8) |
| Phone | keep | `phone String?` | **PII** |
| City | keep | `city String?` | residence (telehealth) |
| State | keep | `state String?` | residence state ≠ `licenseState` |
| Population | keep | `population String?` | scoring 20; validate vs `POPULATIONS` |
| Setting | keep | `setting String?` | scoring 10; validate vs `SETTINGS` |
| TelehealthPref | **drop** (D-4) | — | ETL → `Telehealth Only` tag |
| YearsExp | keep | `yearsExp Int?` | filter/display |
| Employer | keep | `employer String?` | display (mildly PII) |
| Tags | keep | `tags String[] @default([])` | validate vs `TAGS` |
| AddedBy | rename | `createdById String?` | actor id string (D-9) |
| AddedAt | rename | `createdAt DateTime @default(now())` | |
| UpdatedAt | rename | `updatedAt DateTime @updatedAt` | generic; does NOT drive SLA |
| OutreachAttempts | **keep** (D-3) | `outreachAttempts Int @default(0)` | denormalized counter |
| Track | keep | `track String @default("Clinical")` | gate input; validate vs `TRACKS` |
| DeletedAt | keep | `deletedAt DateTime?` | soft-delete, filtered by default (indexed) |
| DeletedBy | rename | `deletedById String?` | soft-delete actor |
| ResumeFileID | **defer** (D-2) | → `documents` (Wave 1.2) | |
| ResumeURL | **defer** (D-2) | → `documents` | |
| ResumeFilename | **defer** (D-2) | → `documents` | |

**New fields (no legacy source):** `id` (cuid), `stageOrder`, `stageEnteredAt`, `placedAt`.
**Tally:** 28 keep/rename · 1 drop (`TelehealthPref`) · 3 defer (resume trio).

## 2. Prisma models (spec — backend writes final code)

```
model Client {
  id         String    @id @default(cuid())
  legacyId   String?   @unique
  name       String
  capacity   Int?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
  deletedAt  DateTime?
  candidates Candidate[]
  @@index([deletedAt])
  @@map("clients")
}

model Candidate {
  id                  String    @id @default(cuid())
  legacyId            String?   @unique
  // identity / contact (PII)
  name                String
  email               String?
  phone               String?
  city                String?
  state               String?
  employer            String?
  yearsExp            Int?
  // clinical profile (scoring/gate inputs)
  credential          String?
  population          String?
  setting             String?
  track               String    @default("Clinical")
  source              String?
  tags                String[]  @default([])
  outreachAttempts    Int       @default(0)
  // license / verification
  licenseState        String?
  licenseNumber       String?   // SENSITIVE — DTO-gated + encrypted
  licenseStatus       String    @default("Not Verified")
  licenseExpiry       DateTime?
  licenseVerifiedAt   DateTime?
  licenseVerifiedById String?
  // pipeline (code + ordinal + denormalized timing)
  status              String    @default("NEW_CANDIDATE")
  stageOrder          Int       @default(0)
  stageEnteredAt      DateTime  @default(now())
  placedAt            DateTime?
  // client
  clientId            String?
  client              Client?   @relation(fields: [clientId], references: [id], onDelete: SetNull)
  // lifecycle
  createdById         String?
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt
  deletedAt           DateTime?
  deletedById         String?
  stageHistory        StageHistory[]
  @@index([status])
  @@index([clientId])
  @@index([deletedAt])
  @@index([licenseExpiry])
  @@index([status, deletedAt])
  @@index([email])
  @@map("candidates")
}

model StageHistory {
  id             String    @id @default(cuid())
  candidateId    String
  candidate      Candidate @relation(fields: [candidateId], references: [id], onDelete: Cascade)
  fromStatus     String?
  toStatus       String
  fromStageOrder Int?
  toStageOrder   Int
  enteredAt      DateTime  @default(now())
  actorId        String
  @@index([candidateId])
  @@index([candidateId, enteredAt])
  @@map("stage_history")
}
```

**Denormalization contract (service-enforced, atomic):** on every stage transition set
`stageOrder = statusOrder(status)`, `stageEnteredAt = now()`, and `placedAt = now()` iff
`status === "STARTED_DAY1"` (set once). `stage-timing.ts` reads `stageEnteredAt`, never `updatedAt`.

## 3. PII / PHI

| Field | Class | Handling |
|---|---|---|
| name, email, phone, city, state, employer | PII | repository→service→DTO only; never in logs |
| licenseNumber (+ future npi) | Sensitive | DTO-omit unless `viewCredentials`; encrypt at rest (app-layer) |

Candidate mutations call `writeAudit(tx, …)` (Wave 0.5) inside the same transaction; audit
`before/after` reads stay capability-gated (`viewAudit`, admin-only). The **DTO mapper is the PII
boundary**: `toCandidateDTO(row, viewer)` omits `licenseNumber` unless `hasCapability(viewer.role, "viewCredentials")`.

## 4. Repository + service surface

`server/repositories/candidate.repository.ts` (Prisma confined here; every method accepts optional `tx`):
`create`, `findById(id,{includeDeleted?})`, `findByLegacyId`, `upsertByLegacyId` (ETL), `list(filters)`,
`update`, `softDelete(id, actorId)`, `restore`. Hard `purge` → Wave 2.5.

`CandidateListFilters`: `{ status?, track?, clientId?, search?, tags?, includeDeleted? (default false) }`
— `deletedAt IS NULL` applied by default via the soft-delete extension.

`server/repositories/stage-history.repository.ts`: `add({...}, tx)`, `listByCandidate`, `latest`.

`server/services/candidate.service.ts` — `create`, `update`, `softDelete`, and `move(id, toStatus, user)`:
1. `findById` → `NOT_FOUND` if null.
2. `checkStageGate(toRuleCandidate(row), toStatus)` — if blocking → `AppError("STAGE_BLOCKED")`.
3. `withTransaction`: `update` (status/stageOrder/stageEnteredAt/placedAt) + `stageHistory.add` + `writeAudit`.

`toRuleCandidate(row): RuleCandidate` — 1:1 mapping to `server/rules/types.ts`
(`status, track, credential, licenseState, licenseStatus, population, setting, clientId, email, phone`);
casts stored strings to the constant unions.

## 5. Infra to build in this wave (D-6)
- `server/db/with-transaction.ts` — `withTransaction(fn)` wrapper over `prisma.$transaction`.
- Soft-delete handling in `server/db/prisma.ts` — default-exclude `deletedAt != null` on candidate/client reads; `includeDeleted` opts in.
- `src/lib/constants/clients.ts` — `BASE_CLIENTS` for the `Client` seed.
