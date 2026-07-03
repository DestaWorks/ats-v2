# `server/` — server-only layers

Everything here runs on the server only. Each module should start with `import "server-only"`
so a stray client import fails at build time.

Layers (dependency flows downward only — never upward):

- `services/` — business logic, orchestration, transactions, **authorization**, audit writes.
- `repositories/` — the **only** layer that imports Prisma. Accepts an optional `tx`.
- `rules/` — pure domain rules (scoring, stage gates, disqualify, status normalize). No IO. Unit-tested.
- `auth/` — Better Auth instance + `requireUser` / `requireCapability` guards.
- `db/` — Prisma client singleton + `withTransaction` helper + soft-delete extension.
- `ai/` — Claude API calls (server-held key).
- `http/` — `apiHandler()` wrapper, `AppError`, response helpers.

See `docs/STACK-ARCHITECTURE.md` for the full layer rules.
