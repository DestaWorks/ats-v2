import "server-only";
import { cache } from "react";
import { clientRepository } from "@/server/repositories/client.repository";
import { clientRulesRepository } from "@/server/repositories/client-rules.repository";
import { userRepository } from "@/server/repositories/user.repository";

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
 * dependency. `cache()` is a React render-scoped mechanism; when the backend moves behind a
 * long-running process this module is the single place that changes.
 */

export const cachedClientList = cache(() => clientRepository.list());

/** `id → name` map built from `cachedClientList()` — not a second query. */
export const cachedClientNameMap = cache(async (): Promise<Map<string, string>> => {
  const clients = await cachedClientList();
  return new Map(clients.map((c) => [c.id, c.name]));
});

export const cachedClientRulesList = cache(() => clientRulesRepository.list());

export const cachedUserList = cache(() => userRepository.list());
