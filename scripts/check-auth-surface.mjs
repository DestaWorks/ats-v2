#!/usr/bin/env node
// Auth-surface parity between the Next.js routes and the NestJS controllers that replace them
// (SAAS-RESTRUCTURE-PLAN 4.3, "security review of the auth surface").
//
// Per-route tests already assert 401/403 for each endpoint. What they cannot see is the
// cross-cutting question this answers: across ALL endpoints at once, was any capability widened,
// dropped, or swapped in translation, and is every endpoint behind the right guard.
//
// While both stacks serve, this compares them. Once the Next routes are deleted at the traffic
// cutover, the Next side goes empty — so the floors below fail the check rather than let it
// silently start comparing nothing, which is the failure mode this repo keeps rediscovering.

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"];

// Endpoints that are DELIBERATELY unauthenticated, each with the reason it cannot carry a guard.
// A named list rather than a looser rule: anything not here and unguarded is still a failure, and
// an entry that acquires a guard fails too, so the list cannot quietly go stale.
const PUBLIC_ENDPOINTS = new Map([
  ["GET /health", "readiness probe — a monitor must reach it before any session exists"],
  ["GET /health/live", "liveness probe — same"],
  [
    "POST /access-requests",
    "public request-access form — the applicant has no account yet, by definition",
  ],
  [
    "POST /portal/access-requests",
    "public portal request-access form — the requester holds no portal token yet",
  ],
]);

// --- Next side: path from the file location, capability from requireCapability() in each handler.
const nextFiles = execSync("find apps/web/src/app/api -name route.ts")
  .toString()
  .trim()
  .split("\n");
const next = new Map();
for (const f of nextFiles) {
  const src = readFileSync(f, "utf8");
  const route =
    "/" +
    f
      .replace("apps/web/src/app/api/", "")
      .replace("/route.ts", "")
      .replace(/\[([^\]]+)\]/g, ":$1");
  for (const m of METHODS) {
    // Routes are written `export const GET = apiHandler(...)`, occasionally as a function.
    const re = new RegExp(`export (?:const ${m}\\s*=|(?:async )?function ${m}\\b)`);
    if (!re.test(src)) continue;
    const start = src.search(re);
    const rest = src.slice(start + 1);
    const nextExport = rest.search(
      /\nexport (?:const (?:GET|POST|PATCH|PUT|DELETE)\s*=|(?:async )?function [A-Z])/,
    );
    const body = nextExport === -1 ? rest : rest.slice(0, nextExport);
    const caps = [...body.matchAll(/requireCapability\(\s*[^,]*,\s*["'`]([a-zA-Z]+)["'`]/g)].map(
      (x) => x[1],
    );
    const capsAlt = [...body.matchAll(/requireCapability\(\s*["'`]([a-zA-Z]+)["'`]/g)].map(
      (x) => x[1],
    );
    const all = [...new Set([...caps, ...capsAlt])];
    next.set(`${m} ${route}`, {
      caps: all,
      auth: /requireUser|requirePortalContact/.test(body),
      file: f,
    });
  }
}

// --- Nest side: @Controller prefix + @Get/@Post path, capability from @RequireCapability.
const ctrlFiles = execSync("find apps/api/src/modules -name '*.controller.ts'")
  .toString()
  .trim()
  .split("\n");
const nest = new Map();
for (const f of ctrlFiles) {
  const src = readFileSync(f, "utf8");
  const prefix = src.match(/@Controller\(\s*["'`]([^"'`]*)["'`]/)?.[1] ?? "";
  const classCaps = [];
  const head = src.slice(0, src.search(/export class/));
  const classGuards = [...head.matchAll(/@UseGuards\(([^)]*)\)/g)].map((g) => g[1]).join(",");
  for (const m of head.matchAll(/@RequireCapability\(([^)]*)\)/g)) {
    for (const c of m[1].matchAll(/["'`]([a-zA-Z]+)["'`]/g)) classCaps.push(c[1]);
  }
  // Decorators sit ABOVE the method and in any order (@Get before @RequireCapability, or after),
  // so a whole contiguous decorator block is collected and only then attributed to one route.
  const lines = src.split("\n");
  let block = [];
  for (const l of lines) {
    const t = l.trim();
    if (t.startsWith("@")) {
      block.push(t);
      continue;
    }
    if (t === "") continue;
    if (block.length) {
      const joined = block.join(" ");
      const verb = joined.match(/@(Get|Post|Patch|Put|Delete)\(\s*(?:["'`]([^"'`]*)["'`])?/);
      if (verb) {
        const m = verb[1].toUpperCase();
        const sub = verb[2] ?? "";
        const route = ("/" + [prefix, sub].filter(Boolean).join("/")).replace(/\/+/g, "/");
        const caps = [...joined.matchAll(/@RequireCapability\(([^)]*)\)/g)].flatMap((mm) =>
          [...mm[1].matchAll(/["'`]([a-zA-Z]+)["'`]/g)].map((c) => c[1]),
        );
        const guards = [...joined.matchAll(/@UseGuards\(([^)]*)\)/g)].map((g) => g[1]).join(",");
        nest.set(`${m} ${route}`, {
          caps: [...new Set([...classCaps, ...caps])],
          guards: classGuards + "," + guards,
          file: f,
        });
      }
      block = [];
    }
  }
}

const norm = (p) => p.replace(/:[a-zA-Z]+/g, ":p").replace(/\/+$/, "") || "/";
const nestByNorm = new Map(
  [...nest].map(([k, v]) => {
    const [m, p] = k.split(" ");
    return [`${m} ${norm(p)}`, v];
  }),
);

const failures = [];
const note = (msg) => failures.push(msg);

// 1. No capability widened, dropped, or swapped.
//
// Vestigial after 4.3 deleted the routes this compared against, and deliberately kept: it is what
// would catch a re-added Next route whose capability disagrees with the Nest endpoint serving the
// same path. The count floors are gone because there is nothing left to count; the guard is not.
for (const [key, nx] of next) {
  const [m, p] = key.split(" ");
  const hit = nestByNorm.get(`${m} ${norm(p)}`);
  if (!hit) continue;
  const a = [...nx.caps].sort().join(",");
  const b = [...hit.caps].sort().join(",");
  if (a !== b) note(`capability changed: ${key} — Next [${a || "none"}] -> Nest [${b || "none"}]`);
}

/**
 * The routes that authenticate an identity WITHOUT a tenant, and are not on the platform axis.
 *
 * Named rather than pattern-matched, because "this route needs no tenant" is exactly the claim
 * that must not spread by accident. Each one runs BEFORE a tenant can exist for the caller:
 * someone with two memberships and no claim resolves `ambiguous`, so requiring a resolved tenant
 * here would mean the endpoint that lists your workspaces is the one refusing you.
 */
const PRE_TENANT_ENDPOINTS = new Map([
  ["GET /tenants", "lists the workspaces you may enter — cannot require being in one"],
  ["POST /tenants/switch", "chooses the workspace; the server sets the cookie it just verified"],
  ["POST /tenants/members/accept", "accepts an invitation, which grants the membership itself"],
]);

// 2. Every endpoint sits behind the correct guard.
let classified = 0;
for (const [key, hit] of nest) {
  const g = hit.guards ?? "";
  const publicReason = PUBLIC_ENDPOINTS.get(key);
  const isPublic = publicReason !== undefined;
  const isPortal = key.includes(" /portal") && !isPublic;
  const hasSession = /SessionAuthGuard/.test(g);
  const hasPortal = /PortalAuthGuard/.test(g);
  const hasCapGuard = /CapabilityGuard/.test(g);
  // The platform axis (6.8): authenticates an identity WITHOUT resolving a tenant, because a
  // platform admin may belong to none. Authorization is `requirePlatformCapability` inside the
  // service, in the same call that writes the audit row — never a tenant capability, which is
  // why a `/platform/*` route carrying one is an error rather than an omission.
  const isPlatform = / \/platform\//.test(key) || key.endsWith(" /platform");
  const hasIdentityGuard = /IdentityAuthGuard/.test(g);

  if (isPlatform && hasIdentityGuard && hit.caps.length)
    note(`${key}: platform route declares a tenant capability [${hit.caps}]`);
  if (!isPlatform && hasIdentityGuard && !PRE_TENANT_ENDPOINTS.has(key))
    note(`${key}: carries IdentityAuthGuard but is neither a platform nor a pre-tenant route`);
  if (isPortal && hasSession) note(`${key}: portal route carries SessionAuthGuard`);
  if (isPortal && !hasPortal) note(`${key}: portal route missing PortalAuthGuard`);
  if (!isPortal && hasPortal) note(`${key}: non-portal route carries PortalAuthGuard`);
  if (hit.caps.length && !hasCapGuard)
    note(`${key}: declares [${hit.caps}] but no CapabilityGuard`);
  if (hasCapGuard && !hit.caps.length)
    note(`${key}: CapabilityGuard with no capability — always denies`);

  // CapabilityGuard delegates to requireCapability(), which authenticates AND authorizes in one
  // step, so it is itself an auth guard whenever a capability is attached.
  const authenticated =
    hasSession || hasPortal || hasIdentityGuard || (hasCapGuard && hit.caps.length > 0);
  if (!isPublic && !authenticated) note(`${key}: no auth guard (${hit.file})`);
  if (isPublic && authenticated)
    note(`${key}: listed as deliberately public but carries an auth guard — the list is stale`);
  // A public endpoint's only abuse control is the limiter, so it is required rather than advisory.
  if (isPublic && !/RateLimitGuard/.test(g) && !key.startsWith("GET /health"))
    note(`${key}: deliberately public (${publicReason}) but declares no RateLimitGuard`);
  if (authenticated || isPublic) classified++;
}

// 3. Nothing authenticated in Next may be unauthenticated in Nest.
for (const [key, nx] of next) {
  const [m, p] = key.split(" ");
  const hit = nestByNorm.get(`${m} ${norm(p)}`);
  if (!hit) continue;
  if (nx.auth && !/SessionAuthGuard|PortalAuthGuard|CapabilityGuard/.test(hit.guards ?? "")) {
    note(`${key}: authenticated in Next, unguarded in Nest (${hit.file})`);
  }
}

// Floors: a parser that silently matches nothing would otherwise report a clean surface.
//
// `matched` and `bothCapped` no longer have floors, and that is the point of 4.3's route cutover
// rather than a weakening: the Next routes they compared against are DELETED, so there is one
// surface and nothing left to compare it to. The comparison ran on every translated route while
// both stacks served, and it never found a widened, dropped or swapped capability. What still
// earns a floor is the parse itself — a parser that reads zero controllers would otherwise print
// a clean surface — and every per-endpoint rule below, which reads the Nest side alone.
const FLOORS = { endpoints: 180 };
if (nest.size < FLOORS.endpoints)
  note(
    `only ${nest.size} Nest endpoints parsed (floor ${FLOORS.endpoints}) — the parser is broken, not the surface`,
  );
if (nextFiles.length > 1)
  note(
    `apps/web serves ${nextFiles.length} API routes — after 4.3 only the Better Auth catch-all ` +
      `may remain, or there are two API surfaces again`,
  );
if (classified !== nest.size) note(`${nest.size - classified} endpoints could not be classified`);

if (failures.length) {
  console.error("auth surface: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  `auth surface: OK — ${nest.size} endpoints on one surface, every one behind a guard or on the ` +
    `${PUBLIC_ENDPOINTS.size}-entry public list; apps/web serves ${nextFiles.length} route ` +
    `(Better Auth only).`,
);
