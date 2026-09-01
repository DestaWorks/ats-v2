# One Dockerfile, five runnable targets: `api`, `worker`, `web`, `admin`, `migrate`.
#
# They share a single `deps` + `build` stage so the images are guaranteed to come from the
# same install and the same source graph. Building them separately would let the API and the
# worker drift in the version of a service they share, which is exactly what running them as two
# processes from one bundle is meant to prevent.
#
# Alpine, and the usual objection does not apply. The standard warning against musl with Prisma is
# about its native query engine, which has to be requested as a separate build target — but this
# schema uses the `pg` driver adapter, so `@prisma/client` ships WASM and no platform binary at
# all. What IS native here (sharp, SWC, oxide, lightningcss) all publish musl builds, and pnpm
# picks them because the install runs inside this image rather than being copied into it.
# The saving is roughly 120MB of base image, on every one of the five targets.

# ---------------------------------------------------------------------------- base ----
FROM node:24-alpine AS base
# openssl: Prisma's runtime requirement. ca-certificates: reaching Postgres over TLS.
# libc6-compat: the glibc shim a few prebuilt binaries still expect on musl.
RUN apk add --no-cache openssl ca-certificates libc6-compat
# pnpm comes from the `packageManager` field, so the image cannot use a different one than CI.
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production

# ---------------------------------------------------------------------------- deps ----
# Manifests only, so the install layer is reused whenever source changes but dependencies do not.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY apps/api/package.json ./apps/api/
COPY apps/admin/package.json ./apps/admin/
COPY apps/web/package.json ./apps/web/
COPY packages/application/package.json ./packages/application/
COPY packages/auth/package.json ./packages/auth/
COPY packages/config/package.json ./packages/config/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/db/package.json ./packages/db/
COPY packages/domain/package.json ./packages/domain/
COPY packages/integrations/package.json ./packages/integrations/
COPY packages/jobs/package.json ./packages/jobs/
COPY packages/ui/package.json ./packages/ui/
COPY tooling/eslint/package.json ./tooling/eslint/
COPY tooling/prettier/package.json ./tooling/prettier/
COPY tooling/typescript/package.json ./tooling/typescript/
COPY tooling/vitest/package.json ./tooling/vitest/
# Dev dependencies are required: the build runs esbuild, the Next compiler and the Prisma CLI.
# Retries and a generous timeout because a container build is exactly where a slow or flaky
# link shows up: the install is one long burst of registry traffic, and the default gives up
# fast enough that a build fails for a reason that has nothing to do with the code.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm config set store-dir /pnpm/store \
  && pnpm config set fetch-retries 5 \
  && pnpm config set fetch-retry-maxtimeout 120000 \
  && pnpm config set fetch-timeout 300000 \
  && pnpm config set network-concurrency 4 \
  && pnpm install --frozen-lockfile --prod=false

# --------------------------------------------------------------------------- build ----
FROM deps AS build
COPY . .
# Generated in the image, never copied from the host, so the query engine matches this platform.
# The placeholder URL is scoped to this one command and never becomes an ENV: `prisma.config.ts`
# resolves DIRECT_URL eagerly and `generate` reads the schema, never the database.
RUN DIRECT_URL="postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder" pnpm db:generate
RUN pnpm build:api

# Baked at BUILD time, not read at runtime: `next.config.ts` derives the CSP `connect-src` origin
# from NEXT_PUBLIC_API_URL, and every `NEXT_PUBLIC_*` is inlined into the client bundle. An image
# built with the wrong value produces a browser that is CSP-blocked from its own API, which looks
# exactly like a network error and leaves nothing in the API log. It therefore cannot be deferred
# to `docker run`, and a wrong value here means rebuilding the image, not restarting it.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN}
ENV NEXT_OUTPUT_STANDALONE=1
RUN pnpm app:build
# Server-only: admin reads PLATFORM_API_URL at runtime and inlines no NEXT_PUBLIC_* of its own,
# so unlike the web image this one takes no build argument and is the same in every environment.
RUN pnpm admin:build

# LAST, because it prunes the workspace's node_modules: a self-contained tree holding only what
# `@destaworks/api` declares, transitively. The root package.json carries the web app's
# dependencies (apps/web has no manifest of its own), so a plain `--prod` install still drags
# Next, React and the whole UI tree into an API image.
# The runtime tree, built from the bundle's OWN externals rather than from the workspace.
#
# `pnpm deploy --legacy` was the obvious tool and it is the wrong one: it copies the whole
# workspace store, so `--prod` filtered the top-level links while `.pnpm` still carried Next, the
# SWC binary, TypeScript and Prisma Studio — 923MB of files nothing pointed at.
#
# `apps/api/build.mjs` already states exactly what survives bundling: everything else is inlined.
# Reading the list from there rather than restating it means the image cannot drift from the
# bundle. Versions come from the installed tree, so they match the lockfile the build used.
# `npm ci` against COMMITTED manifests and lockfiles, never `npm install`. `npm install` would
# re-resolve the ~40 transitive packages on every build, so two builds of one commit could ship
# different trees — and this repo is bound to permissive licences only (PROJECT-CONTEXT, NDA §5b),
# which cannot be enforced against a tree nothing records. `pnpm-lock.yaml` does not cover these,
# because the bundle's externals are installed here rather than linked from the workspace.
#
# `pnpm runtime:manifest` regenerates both, and `pnpm runtime:check` fails CI when the pinned
# versions drift from pnpm-lock.yaml — so the second lockfile cannot disagree with the first.
COPY apps/api/runtime/package.json apps/api/runtime/package-lock.json /prod/api/
RUN cd /prod/api && npm ci --omit=dev --no-audit --no-fund --loglevel=error

# The migrator needs the Prisma CLI and nothing else the API carries. Same reasoning as above:
# copying the workspace tree to get one binary brought 1.8GB of unrelated packages with it.
COPY apps/api/runtime-migrate/package.json apps/api/runtime-migrate/package-lock.json /prod/migrate/
RUN cd /prod/migrate && npm ci --omit=dev --no-audit --no-fund --loglevel=error

# ----------------------------------------------------------------------------- api ----
# `packages/` is copied alongside `node_modules` because pnpm's node_modules is a tree of symlinks
# into `.pnpm` and into the workspace; dropping the workspace half leaves dangling links.
FROM base AS api
ENV PORT=3004
# From `pnpm deploy`'s self-contained tree, so the image carries the API's transitive production
# dependencies and nothing else. The bundle's externals (@sentry/node, pino, pg, prisma) resolve
# against this; everything else it needs is already inlined.
COPY --from=build /prod/api/node_modules ./node_modules
COPY --from=build /prod/api/package.json ./package.json
# The bundles only — NOT the `.map` files beside them, which are 28MB of the 45MB `dist`.
#
# Nothing consumes them here: Node maps stack traces only with `--enable-source-maps`, which this
# image does not set, and Sentry needs them UPLOADED at build time rather than present at runtime.
# They are also the original TypeScript, so shipping them puts the source inside every image that
# reaches a registry. `pnpm build:api` still emits them for local debugging and for a future
# upload step; they simply stop travelling with the container.
COPY --from=build /app/apps/api/dist/main.js /app/apps/api/dist/worker.js ./dist/
USER node
EXPOSE 3004
# Liveness, not readiness: readiness needs Postgres, and an orchestrator restarting the container
# because the database is briefly unreachable turns one outage into two.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3004)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]

# -------------------------------------------------------------------------- worker ----
# The same bundle, a different entry point. No port and no health check: it serves nothing, and
# its liveness signal is the queue-depth heartbeat it already logs every minute.
FROM base AS worker
# From `pnpm deploy`'s self-contained tree, so the image carries the API's transitive production
# dependencies and nothing else. The bundle's externals (@sentry/node, pino, pg, prisma) resolve
# against this; everything else it needs is already inlined.
COPY --from=build /prod/api/node_modules ./node_modules
COPY --from=build /prod/api/package.json ./package.json
# The bundles only — NOT the `.map` files beside them, which are 28MB of the 45MB `dist`.
#
# Nothing consumes them here: Node maps stack traces only with `--enable-source-maps`, which this
# image does not set, and Sentry needs them UPLOADED at build time rather than present at runtime.
# They are also the original TypeScript, so shipping them puts the source inside every image that
# reaches a registry. `pnpm build:api` still emits them for local debugging and for a future
# upload step; they simply stop travelling with the container.
COPY --from=build /app/apps/api/dist/main.js /app/apps/api/dist/worker.js ./dist/
USER node
CMD ["node", "dist/worker.js"]

# ----------------------------------------------------------------------------- web ----
# Next's standalone output already contains its own traced node_modules, so this image installs
# nothing and is a fraction of the others.
FROM base AS web
ENV PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
# Next's standalone `server.js` is CommonJS, but the tree it emits carries a copy of the monorepo
# root package.json, whose `"type": "module"` makes Node parse it as ESM and fail on its first
# `require`. Dropping the field restores the default this file was written for.
RUN node -e "const fs=require('fs');const f='/app/package.json';const j=JSON.parse(fs.readFileSync(f,'utf8'));delete j.type;fs.writeFileSync(f,JSON.stringify(j,null,2))"
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

# --------------------------------------------------------------------------- admin ----
FROM base AS admin
ENV PORT=3010 HOSTNAME=0.0.0.0
COPY --from=build /app/apps/admin/.next/standalone ./
COPY --from=build /app/apps/admin/.next/static ./apps/admin/.next/static
RUN node -e "const fs=require('fs');const f='/app/package.json';const j=JSON.parse(fs.readFileSync(f,'utf8'));delete j.type;fs.writeFileSync(f,JSON.stringify(j,null,2))"
USER node
EXPOSE 3010
CMD ["node", "apps/admin/server.js"]

# ------------------------------------------------------------------------- migrate ----
# A one-shot: runs `prisma migrate deploy` and exits. Separate from the API image so migrating is
# an explicit act rather than a side effect of a container starting — N replicas starting at once
# must not be N migrators. It needs DIRECT_URL (prisma.config.ts reads it); a transaction pooler
# supports neither the advisory lock nor the prepared statements migrations use.
FROM base AS migrate
COPY --from=build /prod/migrate/node_modules ./node_modules
COPY --from=build /prod/migrate/package.json ./package.json
# The schema and its migrations — the only thing from the workspace this image reads.
COPY --from=build /app/packages/db/prisma ./packages/db/prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
# The Prisma CLI directly, not `pnpm db:deploy`: pnpm checks workspace dependency status before
# running a script, finds this image has no `apps/` on purpose, and tries to reinstall.
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]
