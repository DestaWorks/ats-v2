import "server-only";
import type { ClientRules as ClientRulesModel, Prisma } from "@/generated/prisma/client";
import type { ClientRules } from "@/lib/rules/types";
import { prisma } from "@/server/db/prisma";

/** A raw client-rules row (Prisma model). Services map this to the pure `ClientRules` (via `toClientRules`). */
export type ClientRulesRow = ClientRulesModel;

/** Resolve the client to use — the transaction client when composing writes, else the singleton. */
function db(tx?: Prisma.TransactionClient) {
  return tx ?? prisma;
}

/**
 * Client-rules data access — the ONLY layer that touches Prisma for scoring rules. The `client_rules`
 * table is tiny (one row per client), so read services fetch them ALL once and build an in-memory
 * `clientId → ClientRules` map (mirroring the `clientId → name` map already built from `clients`),
 * rather than joining per candidate row. Rules are seed-only for now (`db:seed:rules`); an editing UI
 * is a later CRM wave.
 */
export const clientRulesRepository = {
  list(tx?: Prisma.TransactionClient) {
    return db(tx).clientRules.findMany();
  },
};

/**
 * Build the pure-rule `ClientRules` (the shape `scoreCandidate` / `getAutoDisqualify` consume) from a
 * rules row plus its client's display `name`. `name` lives on `Client`, not the rules row, so it is
 * joined in by the caller; `priority` / `autoDisqualify` are NOT part of the scoring interface (they
 * feed the detail UI / DQ context) and are intentionally dropped here.
 */
export function toClientRules(row: ClientRulesRow, clientName: string): ClientRules {
  return {
    name: clientName,
    states: row.states,
    creds: row.creds,
    pops: row.pops,
    settings: row.settings,
  };
}
