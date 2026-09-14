import { requestMemo } from "@destaworks/config/request-cache";
import { systemContextFor } from "@destaworks/domain/system-context";
import type { TenantContext } from "@destaworks/domain/tenant";
import { clientRepository } from "@destaworks/db/repositories/client.repository";
import { clientRulesRepository } from "@destaworks/db/repositories/client-rules.repository";
import { userRepository } from "@destaworks/db/repositories/user.repository";

/**
 * Request-scoped memoization for the handful of reads that every page repeats.
 *
 * Perf audit 2026-08-04: the root layout AND most pages independently issue the same
 * unfiltered list reads (sidebar's add-candidate modal, filter dropdowns, owner selects),
 * duplicating a round trip on nearly every request.
 *
 * These are DELIBERATELY separate from the repository methods they wrap — never cache a
 * repository method directly. Several services call `list`/`nameMap` around a write in the
 * SAME request (create-then-relist); caching there would serve a stale pre-write result.
 * Use these only from render paths and reads that do not mutate in the same request; every
 * mutation-adjacent caller keeps using the raw, uncached repository method.
 *
 * Lives here rather than in the repositories so that data access carries no framework
 * dependency. It was React's `cache()` until the backend moved behind a long-running process,
 * which is exactly the change this comment anticipated: `cache()` only memoizes inside a render,
 * so in NestJS and the worker it did nothing at all. `requestMemo` is scoped by
 * `AsyncLocalStorage` instead and works in both.
 */

/**
 * Keyed by tenant ID, not the context object: `cache()` memoizes on argument identity, so a fresh
 * context per call would miss every time and undo the memo.
 */
const clientListFor = requestMemo("clientList", (tenantId: string) =>
  clientRepository.list(systemContextFor(tenantId)),
);

const clientRulesListFor = requestMemo("clientRulesList", (tenantId: string) =>
  clientRulesRepository.list(systemContextFor(tenantId)),
);

export const cachedClientList = (ctx: TenantContext) => clientListFor(ctx.tenantId);

/** `id → name` map built from `cachedClientList()` — not a second query. */
export const cachedClientNameMap = async (ctx: TenantContext): Promise<Map<string, string>> => {
  const clients = await cachedClientList(ctx);
  return new Map(clients.map((c) => [c.id, c.name]));
};

export const cachedClientRulesList = (ctx: TenantContext) => clientRulesListFor(ctx.tenantId);

/**
 * This workspace's operators.
 *
 * `User` is a GLOBAL model — one human, many tenants — which is exactly why this takes a tenant:
 * the enforcement seam cannot scope the table, so the caller must, and every screen this feeds is
 * tenant-scoped. It reads through `listByTenant`, whose membership predicate IS the scope.
 */
const userListFor = requestMemo("userList", (tenantId: string) =>
  userRepository.listByTenant(tenantId),
);

export const cachedUserList = (ctx: TenantContext) => userListFor(ctx.tenantId);
