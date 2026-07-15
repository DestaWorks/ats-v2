# Stack Architecture & Conventions — DestaHealth ATS (Target)

The definitive architecture and coding conventions for the rebuilt app. This supersedes the
generic stack notes in `ARCHITECTURE.md`/`EDD.md` and locks the decisions.

## Locked stack

| Concern | Choice |
|---------|--------|
| Framework | **Next.js** (App Router) + **React + TypeScript** |
| Styling | **Tailwind CSS v4** (CSS-first config) |
| Toasts/notifications | **Sonner** |
| ORM / DB | **Prisma** + **PostgreSQL** (managed via **Supabase**) |
| Auth | **Better Auth** (Prisma adapter, email/password + Google) — on Supabase Postgres¹ |
| AI | **Claude API (Anthropic)** via serverless endpoints — server-held key |
| Validation | **Zod** (shared client ↔ server) |
| Server state | **RSC reads + typed fetch helpers** (see §6) — no client cache library |
| Forms | **react-hook-form + zodResolver** |
| Drag & drop | **dnd-kit** (accessible) |
| UI primitives | **shadcn/Radix** for a11y-hard primitives only (Dialog, DropdownMenu, Combobox, Sonner) |
| Hosting | **Vercel** — production `zyx.com` (`main`) · staging `staging.zyx.com` (`staging`) · per-PR previews² |
| Package manager | **pnpm** |

> ¹ **Decided.** Company direction names "Supabase (PostgreSQL + auth)"; we use **Supabase
> purely as managed Postgres** (and object storage) with **Better Auth** as the auth/RBAC
> layer — a technical "how" call (owned by the engineer), to be shared with the Owner, not
> blocked on him. Rationale: code-owned six-role RBAC + server guards, auth stays portable.
> Licensing & secrets rules in §12 are contractually binding (NDA) — read them.
>
> ² **Three isolated environments (DECISIONS D6).** Production (`zyx.com`, `main` branch) and
> staging (`staging.zyx.com`, `staging` branch) run on **two separate Supabase projects** —
> staging never touches production PII. Secrets, `BETTER_AUTH_URL`, and Google OAuth redirect
> URIs are **per-environment/per-domain**. Migrations and the Sheet→Postgres data migration are
> dry-run on staging first, then applied to production. Full setup: `IMPLEMENTATION-PLAN.md` 0.1b.
> (`zyx.com` is a placeholder for the real domain.)

---

## 1. Architectural model — layered, one-way dependencies

Two halves: an **RSC-first client** (feature code co-located under `app/(app)/<feature>/`) and a
**layered server** (API → service → repository → db). The hard rule is **dependencies only point
downward**; a lower layer must never import an upper one.

```
              ┌─────────────────────────────────────────────┐
   CLIENT     │  app/(app)/<feature>/page.tsx  (RSC — reads,  │
   (browser   │  calls services directly, no client fetch)   │
    + RSC)    │        │ renders, passes DTOs as props        │
              │  app/(app)/<feature>/*.tsx  ("use client" —   │
              │  interactive: forms, tables, filters, DnD)    │
              └────────┼─────────────────────────────────────┘
                       │  fetch /api  (lib/api/client.ts typed helpers)
              ┌────────▼─────────────────────────────────────┐
   SERVER     │  app/api/.../route.ts   = API layer           │  ← controllers: validate(zod)
              │        │                                       │     + authz + shape response
              │  server/services/       = business logic       │  ← orchestration, rules, tx
              │        │                                       │
              │  server/repositories/   = data access          │  ← ONLY layer touching Prisma
              │        │                                       │
              │  server/db/ (prisma)    = database client      │
              └──────────────────────────────────────────────┘
   SHARED     lib/validation (zod) · lib/utils · lib/constants · server/rules (pure)
```

**Downward dependency rule (enforced by lint — §11):**
- `route handler → service → repository → prisma`. Never the reverse.
- **Client never imports services/repositories/prisma.** It only calls the HTTP API (or a
  thin Server Action that itself calls a service).
- **Only repositories import Prisma.** Services speak in domain types, not Prisma types.
- `lib/validation` (zod) and `server/rules` (pure functions) are leaf, imported by anyone.

### Why this shape
- **Swappable & testable:** business logic (services) and rules are pure/decoupled — unit
  testable without HTTP or a DB; repositories are mockable.
- **One place for each concern:** a reviewer always knows where logic belongs.
- **Security by construction:** authZ lives at the API boundary and in services, never in the
  client. The client cannot reach data except through guarded endpoints.

---

## 2. Folder structure

> **Superseded from the original design:** a separate `modules/<feature>/` client tree
> (components/hooks/api/query-keys.ts, TanStack Query-backed) was planned but never built. Every
> wave shipped instead co-locates a feature's client code directly under
> `app/(app)/<feature>/` — see §3.6/§6. `src/modules/` exists on disk only as an empty,
> unused placeholder; do not add to it.

```
desta-ats/
├─ prisma/
│  ├─ schema.prisma            # models incl. Better Auth (User/Session/Account/Verification)
│  └─ migrations/
├─ src/
│  ├─ app/
│  │  ├─ (auth)/sign-in/page.tsx
│  │  ├─ (app)/                # authenticated shell (sidebar lives here)
│  │  │  ├─ layout.tsx
│  │  │  ├─ pipeline/
│  │  │  │  ├─ page.tsx             # RSC — guard, load DTOs via services, render the client view
│  │  │  │  ├─ pipeline-board.tsx   # "use client" — the interactive board (state, mutations)
│  │  │  │  └─ lib/                 # board-fetch.ts (typed fetchers), small pure helpers
│  │  │  ├─ sourcing/  candidates/  roles/  daily-log/  trash/  activity/  …  (same shape)
│  │  │  └─ lib/                    # cross-feature client helpers scoped to the (app) group:
│  │  │                             # FilterToolbar/FiltersPopover/FilterField, use-url-filters,
│  │  │                             # FilterChip — shared by candidates/pipeline/roles/sourcing
│  │  ├─ api/                  # === API LAYER (HTTP controllers) ===
│  │  │  ├─ auth/[...all]/route.ts        # Better Auth handler
│  │  │  ├─ candidates/route.ts           # GET list / POST create
│  │  │  ├─ candidates/[id]/route.ts      # GET / PATCH / DELETE
│  │  │  ├─ candidates/[id]/move/route.ts # POST stage transition
│  │  │  ├─ leads/…  roles/…  daily/…
│  │  ├─ layout.tsx
│  │  └─ globals.css           # @import "tailwindcss"; @theme { … }
│  │
│  ├─ server/                  # === SERVER-ONLY LAYERS ('server-only' guarded) ===
│  │  ├─ services/             # business logic / orchestration / transactions
│  │  │  ├─ candidate.service.ts
│  │  │  ├─ lead.service.ts
│  │  │  └─ brief.service.ts
│  │  ├─ repositories/         # data access — ONLY place importing Prisma
│  │  │  ├─ candidate.repository.ts
│  │  │  └─ lead.repository.ts
│  │  ├─ rules/                # PURE domain rules (no IO) — fully unit-tested
│  │  │  ├─ scoring.ts         # scoreCandidate(candidate, clientRules) — rules passed in
│  │  │  ├─ stage-gates.ts     # STAGE_REQUIRED, canTransition() — keyed off status CODE
│  │  │  ├─ disqualify.ts      # getAutoDisqualify()
│  │  │  └─ stage-alerts.ts    # STAGE_ALERTS (CLIENT_RULES now live in the client_rules table)
│  │  ├─ auth/
│  │  │  ├─ auth.ts            # betterAuth(...) server instance
│  │  │  └─ guards.ts          # requireUser(), can(), requireCapability(), requireLeadership()
│  │  ├─ db/
│  │  │  ├─ prisma.ts          # PrismaClient singleton (+ soft-delete extension)
│  │  │  └─ with-transaction.ts # withTransaction(cb) → passes tx to repositories
│  │  ├─ ai/                   # LLM calls (server-side keys): resume parse, briefs, triage
│  │  └─ http/                 # apiHandler() wrapper, AppError, response helpers
│  │
│  ├─ lib/                     # === SHARED / ISOMORPHIC ===
│  │  ├─ validation/           # zod schemas (shared client+server) → DTOs & inputs
│  │  │  ├─ candidate.ts
│  │  │  └─ lead.ts
│  │  ├─ api/client.ts         # getJson/postJson/patchJson/putJson/deleteJson — see §6
│  │  ├─ pagination.ts         # PageMeta / pageMeta() — shared offset-page envelope + math
│  │  ├─ forms/                # useZodForm, emptyToNull/emptyToNullNumber
│  │  ├─ constants/            # STATUSES, CLIENTS, SOURCES, ROLES, TAGS, COMPACT_STATES
│  │  ├─ utils/                # dates, formatting, pure helpers
│  │  └─ auth-client.ts        # Better Auth React client (signIn/useSession…)
│  │
│  ├─ components/ui/           # shared UI primitives (Button, Input, Select, Table, Pager,
│  │                           # Sonner <Toaster/>) — generic, no feature/route awareness
│  └─ styles/
├─ eslint.config.mjs           # layer boundaries via eslint-plugin-boundaries + no-restricted-paths
└─ docs/
```

> The names match the user's request: **client modules**, **API**, **services**,
> **repository**, **db**, plus **utils/validation/rules/auth** as supporting layers.

---

## 3. The layers in detail

### 3.1 API layer — `app/api/**/route.ts` (thin controllers)
Responsibilities, in order, every time:
1. **Authenticate** (`requireUser`) and **authorize** by **capability** (`can(...)` /
   `requireCapability`) — not by hardcoded role lists.
2. **Validate** input with a zod schema from `lib/validation`.
3. **Delegate** to a service (one call, no business logic here).
4. **Shape** the response (DTO) and return.
No Prisma, no rules, no orchestration in route handlers.

```ts
// app/api/candidates/[id]/move/route.ts
import { apiHandler } from "@/server/http/api-handler";
import { requireUser } from "@/server/auth/guards";
import { moveCandidateInput } from "@/lib/validation/candidate.schema";
import { candidateService } from "@/server/services/candidate.service";

export const POST = apiHandler(async (req, { params }) => {
  const user = await requireUser();                       // authn
  const input = moveCandidateInput.parse(await req.json()); // validation
  const result = await candidateService.move(params.id, input, user); // delegate
  return Response.json(result);                            // shaped DTO
});
```

### 3.2 Service layer — `server/services/*.service.ts` (business logic)
- Orchestrates repositories + rules; owns transactions; enforces invariants.
- Receives the acting `user` and performs **authorization decisions** (e.g. only leadership
  can purge). Calls `server/rules` for scoring/stage-gates. Writes the **audit log**.
- Returns **domain objects / DTOs**, never raw Prisma rows that leak internals.

Services **never call `prisma.$transaction` directly** (that would violate
`no-prisma-outside-repositories`). Instead they use the **`withTransaction`** helper in
`server/db`, which opens a transaction and passes the `tx` client to repositories:

```ts
// server/services/candidate.service.ts
import { withTransaction } from "@/server/db/with-transaction";

async move(id, input, user) {
  requireCapability(user, "moveCandidate");                // capability check
  const c = await candidateRepo.findById(id);
  if (!c) throw new AppError("NOT_FOUND", "Candidate not found");
  const blocking = checkStageGate(c, input.toStatus);      // pure rule (keyed off status CODE)
  if (blocking.length) throw new AppError("STAGE_BLOCKED", blocking.join("; "));
  const updated = await withTransaction(async (tx) => {    // helper owns the tx, not the service
    const u = await candidateRepo.update(id, { status: input.toStatus }, tx);
    await stageHistoryRepo.add({ candidateId: id, fromStage: c.status,
                                 toStage: input.toStatus, actorId: user.id }, tx);
    await activityRepo.log({ actor: user.id, action: "move", entity: "candidate",
                             entityId: id, before: c.status, after: input.toStatus }, tx);
    return u;
  });
  return toCandidateDTO(updated);
}
```

`withTransaction` lives in `server/db` (alongside the Prisma singleton) so it — not the
service — is the only place that touches `prisma.$transaction`; repositories receive `tx`.

### 3.3 Repository layer — `server/repositories/*.repository.ts` (data access)
- **The only code that imports Prisma.** Encapsulates all queries.
- Methods accept an optional `tx` (Prisma transaction client) so services control atomicity.
- Returns Prisma rows mapped to domain types where useful; no business rules here.

### 3.4 db — `server/db/*`
- `prisma.ts`: a single `PrismaClient` instance (HMR-safe singleton), extended with a
  **soft-delete helper that applies `deleted_at IS NULL` by default** so soft-deleted PII never
  leaks into lists. Nothing imports `PrismaClient` directly except repositories (via this module).
- `with-transaction.ts`: the **only** call site of `prisma.$transaction`. Services call
  `withTransaction(cb)`; the callback receives `tx`, which is threaded into repositories.

### 3.5 rules — `server/rules/*` (pure, server-authoritative)
- The ported rules engine: `scoreCandidate`, `getAutoDisqualify`, `STAGE_REQUIRED`,
  `STAGE_ALERTS`. **Pure functions, no IO, 100% unit-tested.**
- **`CLIENT_RULES` is NOT code — it is data** loaded from the `client_rules` table.
  `scoreCandidate(candidate, clientRules)` is **pure and takes the rules as an argument**, so
  custom clients (not just the base set) can be scored. The service loads the rules from the
  repository and passes them in; the rule function itself does no IO.
- **Status is codes/ordinal, not labels.** Scoring, gates and funnels compare the stable status
  **code** and its `stage_order` — never the display label.
- These are the **source of truth**. The client may import the same pure functions (passing the
  same rules fetched via the API) for instant UX feedback, but the server decision is
  authoritative.

### 3.6 Client feature code — `app/(app)/<feature>/*`
- Self-contained per feature, co-located with its route (no separate `modules/` tree — see the
  §2 note). **No server imports** in anything that isn't a `page.tsx`/`layout.tsx` RSC.
- **`page.tsx`** (RSC, no `"use client"`): guards (`getCurrentUser`/`requireUser`), loads DTOs by
  calling `server/services/**` directly (no fetch — same process), renders the client view with
  those DTOs as props. Multi-read pages centralize the composite load in a `lib/load-*.ts`
  helper (e.g. `roles/[id]/lib/load-detail.ts`) so the guard → read → `NOT_FOUND` mapping lives
  in one place.
- **`<feature>-view.tsx` / `<feature>-inventory.tsx` / `<feature>-board.tsx`** (`"use client"`):
  the interactive surface — state, filters, mutations. Holds its own `useState`/`useTransition`;
  no client-side data-fetching library.
- **`lib/`**: typed fetchers (thin wrappers over `lib/api/client.ts`, e.g. `board-fetch.ts`,
  `lead-fetch.ts`) plus small pure helpers local to the feature.
- **`add-*-modal.tsx`**: the create-flow pattern — a `Button` + shared `Modal`, mounted only
  while open, `useZodForm` + the same zod schema the route enforces, `router.push`/`onAdded`
  on success (see §6).

---

## 4. Authentication & authorization (Better Auth)

**Server instance** — `server/auth/auth.ts`:
```ts
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import prisma from "@/server/db/prisma";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  // Public self-registration is DISABLED — accounts are invite/approval-gated.
  emailAndPassword: { enabled: true, disableSignUp: true },
  socialProviders: { google: { clientId: process.env.GOOGLE_CLIENT_ID!,
                               clientSecret: process.env.GOOGLE_CLIENT_SECRET! } },
  // `role` is a Better-Auth-validated STRING (not a Postgres enum — Better Auth owns this
  // column). Type-safety comes from a zod `Role` guard + a typed session cast, below.
  user: { additionalFields: { role: { type: "string", defaultValue: "Associate" } } },
  plugins: [nextCookies()], // must be last — lets Server Actions set cookies
});
```

> **Signup gating.** There is **no open sign-up**. New accounts come only through an
> invite / access-request → approval flow (`access_requests` + `invites`). The public
> "request access" screen creates a pending request; a leadership capability approves it.

**Route handler** — `app/api/auth/[...all]/route.ts`:
```ts
import { auth } from "@/server/auth/auth";
import { toNextJsHandler } from "better-auth/next-js";
export const { GET, POST } = toNextJsHandler(auth);
```

**Client** — `lib/auth-client.ts`:
```ts
import { createAuthClient } from "better-auth/react";
export const { signIn, signUp, signOut, useSession } = createAuthClient();
```

**Schema generation:** add Better Auth models with the CLI, then migrate:
```bash
npx @better-auth/cli generate     # adds User/Session/Account/Verification to schema.prisma
npx prisma migrate dev --name add-auth
```
(Confirm the exact CLI invocation against the installed Better Auth version.)

**Roles & capabilities.** Roles are a **fixed enum of 6**: `Owner, Director, Manager, Screener,
Associate, Admin` — `admin` is a **role value**, not a boolean flag; an account is exactly one
role. **Custom-role creation is deferred to v2.** The enum + capability map live in
`lib/constants` and are validated with a zod `Role` guard (Better Auth stores `role` as a
validated string — we do **not** make it a Postgres enum). Guards are **capability-based**:
"**leadership**" is a **capability group**, not a hardcoded role list.

```ts
// lib/constants/roles.ts
export const ROLES = ["Owner","Director","Manager","Screener","Associate","Admin"] as const;
export const Role = z.enum(ROLES);            // zod guard → reconcile the Better-Auth string
export type Role = z.infer<typeof Role>;
// capability map: role → capabilities (leadership is derived, not a role literal)
export const CAPABILITIES: Record<Role, Capability[]> = {
  Owner:    ["viewReports","bulkImport","viewCredentials","viewCrm","viewAudit","purgeCandidate"],
  Director: ["viewReports","bulkImport","viewCredentials","viewCrm","viewAudit"],
  Manager:  ["viewReports","bulkImport","viewCredentials","viewCrm"],
  Admin:    ["viewReports","bulkImport","viewCredentials","viewCrm","viewAudit","purgeCandidate"],
  Screener: [],
  Associate: [],
};
```

**Server-side guards** — `server/auth/guards.ts` (the RBAC boundary):
```ts
export async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new AppError("UNAUTHORIZED", "Sign in required");
  // reconcile the Better-Auth `role` string with the zod Role guard → typed session cast
  const role = Role.parse(session.user.role);
  return { ...session.user, role } as SessionUser;
}
export function can(user: SessionUser, cap: Capability) {
  return CAPABILITIES[user.role].includes(cap);
}
export function requireCapability(user: SessionUser, cap: Capability) {
  if (!can(user, cap)) throw new AppError("FORBIDDEN", "Insufficient capability");
}
// "leadership" is a capability group — guards check capabilities, NOT a role list:
export const requireLeadership = (u: SessionUser) => requireCapability(u, "viewReports");
```

**Rules:** `role` is a DB column on `User`; **never** trusted from the client. Every API route
calls `requireUser` and the relevant **capability** guard (`can(...)` / `requireCapability`),
not `requireRole(["Owner",...])`. UI hiding of leadership/admin items is UX only — the server
enforces.

---

## 5. Validation (Zod) — one schema, both sides

- Define input + DTO schemas in `lib/validation/*`. Infer TS types with `z.infer`.
- **API routes** `.parse()` request bodies (throw → 400 via `apiHandler`).
- **Client** reuses the same schemas for form validation and to validate API responses
  (DTO guard) so a backend change surfaces immediately.

```ts
// lib/validation/candidate.schema.ts
export const candidateStatus = z.enum(STATUS_CODES); // stable codes (NEW_CANDIDATE…), not labels
export const createCandidateInput = z.object({
  name: z.string().min(1), email: z.string().email().optional(),
  credential: z.string().optional(), licenseState: z.string().length(2).optional(),
  track: z.enum(["Clinical","Operations"]).default("Clinical"),
});
export type CreateCandidateInput = z.infer<typeof createCandidateInput>;
```

---

## 6. Data fetching & mutations (client)

**Decided (supersedes the original TanStack Query plan — no client cache library was adopted;
`package.json` has no dependency on one).** Every wave since Wave 0 has shipped this pattern with
zero deviation:

**RSC vs client.** `app/(app)/<feature>/page.tsx` is an RSC — it guards, calls
`server/services/**` directly (no fetch, no client cache — same process), and passes the DTO down
as props. Everything interactive (forms, tables, filters, DnD, modals) is a **client component**
sibling in the same feature folder (see §3.6). RSC is also used for the read-only pages
(Client Portal, Credentials matrix, printable reports) — same mechanism, no special case.

**Client-state classification** (decide per piece of state):

| Kind of state | Where it lives |
|---------------|----------------|
| Server state (candidates, leads, roles…) | **RSC read on load** + **`router.refresh()`** after a mutation (re-runs the RSC, no client cache to invalidate) |
| Ephemeral UI (open/closed, hover, draft toggles, in-flight lists) | **`useState`** |
| Shareable filters / saved views | **URL `searchParams` + a `saved_views` table** — never localStorage |
| Non-sensitive personal prefs | localStorage (only these) |

- **Reads:** the owning `page.tsx` (or a `lib/load-*.ts` composite loader for multi-read pages)
  calls services directly and seeds the client component's props. There is no client-side
  re-fetch of the same data — the client component holds it in `useState`, seeded from props,
  and patches it locally after a mutation (or just calls `router.refresh()` and lets the new
  props flow back down).
- **Writes:** every mutation goes through **`lib/api/client.ts`**'s typed helpers —
  `getJson`/`postJson`/`patchJson`/`putJson`/`deleteJson` — which return a discriminated
  **`ApiResult<T>`**: `{ ok: true, data: T }` or `{ ok: false, failure: ApiFailure }`
  (`{ code, message, issues }`, from the route's `{ error: {...} }` envelope). The caller
  branches directly: field-level `issues` → `form.setError(...)`; anything else →
  `messageForFailure(failure)` + a **Sonner** toast. On success: either `router.refresh()`
  (re-runs the RSC read) or an in-place `setState` patch for snappier UX, then a success toast.
  Feature `lib/` files (e.g. `board-fetch.ts`, `lead-fetch.ts`) wrap these into one-liners typed
  to the feature's DTOs — never call `fetch()` directly in a component.
- **Forms** use **react-hook-form + `zodResolver`** (the shared `useZodForm` hook) with the same
  `lib/validation` schema the API route parses — client and server validate identically.
- **Saved views** are persisted in the `saved_views` table and encoded in the URL
  `searchParams`, so a view is shareable/bookmarkable and survives reload.

**Optimistic updates** use React's built-in **`useOptimistic` + `useTransition`** — no
manual snapshot/rollback bookkeeping (the pipeline board's card move is the reference case):

```ts
const [optimisticBoard, addOptimistic] = useOptimistic(board, applyBoardMove);
const [, startTransition] = useTransition();

function onMove(card: CandidateCardDTO, toStatus: CandidateStatus) {
  startTransition(async () => {
    addOptimistic({ id: card.id, toStatus });      // shows immediately
    const result = await postMove(card.id, toStatus); // typed fetcher → ApiResult<T>
    if (result.ok) {
      setBoard((prev) => applyBoardMove(prev, card.id, toStatus)); // commit to base
      toast.success(`${card.name} moved`);
    } else {
      toast.error(messageForFailure(result.failure)); // base unchanged → useOptimistic reverts
    }
  });
}
```

Drag-and-drop itself uses **dnd-kit** (keyboard- and screen-reader-accessible), not the legacy
hand-rolled HTML5 DnD.

> **API style decision:** primary write path is **Route Handlers** under `app/api` (explicit,
> typed, reusable by the client portal and any future consumer), fronted by an `apiHandler()`
> wrapper that authenticates/authorizes/validates/shapes-errors uniformly (§7) and returns the
> `ApiResult<T>` envelope. **Server Actions are the exception, not the default** — used only where
> there's no session to hit a guarded route against (`(auth)/request-access/actions.ts`, pre-auth).
> They stay thin (validate with the shared zod schema, delegate to a service) and return their own
> small `{ ok, error }` shape rather than the full envelope. Default to a Route Handler; reach for
> a Server Action only for a genuinely pre-auth/public form.

---

## 7. Error handling

- Single `AppError(code, message, status?)` type. `apiHandler` catches it → JSON
  `{ error: { code, message } }` with the right HTTP status; zod errors → 422 with field
  details; anything else → 500 (message hidden, logged).
- Services throw `AppError`; never return naked nulls for error states.
- Client maps `error.message` to a Sonner toast.

---

## 8. Styling — Tailwind v4 + a small component-class layer (decided)

**Legacy inline styles are translated to Tailwind utilities**, plus a small **component-class
layer** for repeated patterns (cards, badges, note blocks). "1:1" means the **same look**, not
the same inline-style soup. No `@apply` soup; extract shared patterns into components.

- Tailwind v4 **CSS-first**: `@import "tailwindcss";` in `globals.css`. No `tailwind.config.js`
  unless a plugin needs it.
- **`@theme` token table — named tokens.** Map the legacy `C` palette **and** the `SC` status
  colors (the 13 pipeline-stage colors) **and** the common ad-hoc grays to **named** tokens,
  renaming cryptic keys (`ch`→`charcoal`, `bl`→`navy`, etc.). Status tokens are keyed to the
  status **code** so the kanban color follows the code, not a label.

```css
/* globals.css */
@import "tailwindcss";
@theme {
  /* brand (was C) */
  --color-brand:    #8B7355;   /* was C.br */
  --color-navy:     #1E4A8A;   /* was C.bl */
  --color-charcoal: #2B2B2B;   /* was C.ch */
  --color-gray-050: #F7F7F5;   /* ad-hoc grays → named steps */
  /* status colors (was SC), one per status CODE */
  --color-status-new-candidate:      #64748B;
  --color-status-qualified-prescreen:#0EA5E9;
  --color-status-submitted-to-client:#6366F1;
  --color-status-offer-accepted:     #16A34A;
  --color-status-started-day1:       #15803D;
  --color-status-not-qualified:      #DC2626;
  /* …one token per code through FUTURE_PIPELINE… */
}
```

- **shadcn/Radix — adopted ONLY for a11y-hard primitives** (this closes the earlier "optional"
  question): **Dialog**, **DropdownMenu**, **Combobox** (the @mention picker), and **Sonner**
  toasts. Everything else (layout, kanban, cards) is bespoke Tailwind. We do **not** wholesale
  adopt shadcn for the whole UI.
- **Sonner**: mount `<Toaster richColors position="top-right" />` once in the root layout; use
  `toast.success/error/loading` for all user feedback (replaces the legacy ad-hoc toasts).

---

## 9. Naming conventions

- Files: `kebab-case.ts`; components `PascalCase.tsx`. Layer suffixes: `*.service.ts`,
  `*.repository.ts`, `*.schema.ts`, `*.rules.ts`.
- React: `PascalCase` components, `useX` hooks, `camelCase` everything else.
- Domain values are **enums/unions**, not loose strings (`Status`, `Role`, `Track`,
  `LicenseStatus`). Module constants `UPPER_SNAKE`.
- **No legacy abbreviations** (`sV`, `vw`, `sFC`). Names say what they are
  (`setView`, `currentView`).

---

## 10. Testing per layer

| Layer | Test type | Tool |
|-------|-----------|------|
| `server/rules` | Unit (pure) — scoring, gates, disqualify | Vitest |
| `server/services` | Integration with mocked repos / test DB | Vitest |
| `app/api` routes | Integration incl. authz failure cases | Vitest + test Postgres |
| `lib/validation` | Schema round-trip / edge cases | Vitest |
| Critical flows | E2E: sign-in, add/move candidate, promote lead, parse resume | Playwright |

CI runs typecheck + lint + tests on every PR. Red = no merge.

---

## 11. Boundary enforcement (lint)

Use **off-the-shelf lint boundaries** — **`eslint-plugin-boundaries`** and/or
**`import/no-restricted-paths`** — configured declaratively, **instead of hand-written AST
rules**. The same intents, expressed as config:

| Intent | Enforced by |
|--------|-------------|
| `no-prisma-outside-repositories` — only `server/repositories/**` (and `server/db/**`) import `@prisma/client` | `import/no-restricted-paths` zone |
| `no-server-in-client` — `modules/**` & client `app/**/page.tsx` can't import `server/**` | `eslint-plugin-boundaries` element rule |
| `no-upward-imports` — repository ✗→ service ✗→ route; downward only | `eslint-plugin-boundaries` element rule |
| `services-no-react` — `server/services/**` must not import React/Next UI | `import/no-restricted-paths` zone |

Also keep **`import "server-only"`** at the top of `server/**` modules so a stray client import
fails at build time. (No bespoke `eslint-local-rules/` package to maintain.)

---

## 12. Binding constraints (NDA) — non-negotiable

These come from the signed Developer NDA and from how the Owner runs security. Treat them as
**acceptance criteria**, not preferences (full context: `docs/PROJECT-CONTEXT.md`).

- **No secrets in code, ever.** Keys/tokens/DB URLs live in env vars / Vercel & Supabase
  secret stores only. The **Owner holds all keys** (Claude API, Supabase, Vercel, billing,
  patient-data access); we build against them. Never commit a `.env`; commit `.env.example`.
- **Permissive licenses only.** Add a dependency carrying **MIT / BSD / Apache-2.0** freely.
  **Never add a copyleft/reciprocal dependency (GPL / LGPL / AGPL)** without the Owner's
  written consent. Keep an **SBOM** (`docs/THIRD-PARTY-LICENSES.md` or a generated manifest)
  and update it when dependencies change. Add a CI license check.
- **AI tooling** (incl. Claude Code) must not transmit confidential source to third parties in
  a way that compromises confidentiality/ownership; output is Owner-owned Work Product.
- **PHI/PII handling (HIPAA + Ethiopian Data Protection Proclamation 1321/2024):** encrypt at
  rest, restrict sensitive columns by role, **never log PII/PHI**, signed expiring URLs for
  resume/document files, full audit trail, and a documented breach-reporting path.
- **No malicious code / backdoors** — warranted in the NDA. Code is reviewed via PRs.
- **Owner-controlled delivery:** all work lives in the Owner's repos; no retained copies.

---

## 13. AI features (Claude API)

- All LLM calls go through **server-side endpoints** (`server/ai/**`) with a **server-held
  Anthropic key** — never from the client.
- ATS AI surfaces: résumé extraction, daily/weekly briefs, JD parsing, inbound triage, CRM
  workspace, and (roadmap) résumé→profile matching and "find providers like this".
- **Model tiering:** use the cheapest model that meets the bar per task (e.g. a fast model for
  extraction/conversation, a stronger model for grading/judgement) — mirrors the company's
  LMS pattern. Pick current Claude models at build time; pin the model id in config, not
  scattered in code. Validate model output with zod before persisting.

---

## 14. Decisions on record

1. **Route Handlers are the primary API**; Server Actions allowed but thin. (§6)
2. **Rules engine is server-authoritative and pure**; client mirrors for UX only. (§3.5)
3. **Repositories are the sole Prisma consumers**; services speak domain types. (§3.3)
4. **AuthZ at API boundary + service layer**, never client. Role is a DB column. (§4)
5. **One zod schema per concern**, shared client/server. (§5)
6. **Tailwind v4 CSS-first + Sonner for all toasts**; **shadcn/Radix adopted for a11y-hard
   primitives only** (Dialog, DropdownMenu, Combobox/@mention, Sonner) — not optional. (§8)
7. **Boundaries enforced by off-the-shelf lint plugins + `server-only`**, not hand-written AST
   rules. (§11)
8. **RBAC is capability-based** (fixed 6-role enum → capability map; `admin` is a role value;
   custom roles v2; signup disabled). (§4)
9. **`client_rules` is data**; `scoreCandidate(candidate, clientRules)` is pure. Status is
   codes/ordinal. (§3.5)
10. **RSC reads + `lib/api/client.ts`'s typed `ApiResult<T>` helpers are the server-state
    layer** (no client cache library); ephemeral→`useState`, shareable→URL `searchParams` +
    `saved_views` table. (§6)

Open: confirm the Better Auth CLI command for the installed version.
