/**
 * Row ceilings for repository reads.
 *
 * A `findMany` in this package is bounded one of four ways: a caller-supplied `take`, the id set it
 * was handed, one of the constants below, or a documented decision to stay complete. Nothing else —
 * an unbounded read returns whatever one tenant has accumulated, and on a shared install that is
 * every other tenant's page latency too.
 *
 * These are ceilings, not page sizes. Where a bound could truncate a result the caller reasons
 * over, the method says so at its own definition.
 */

/**
 * One parent's children — a candidate's notes, a client's tasks, a lead's outreach log.
 *
 * Follows the `ENTITY_TRAIL_CAP` precedent already set by `audit.repository.ts`: these reads are
 * newest-first and feed a detail view that does not paginate, so the cap drops the oldest tail of a
 * history rather than an arbitrary slice.
 */
export const CHILD_ROWS_CAP = 500;

/**
 * A whole-tenant reference read that callers treat as COMPLETE — the client name map, the scoring
 * rules, one day's targets across the team.
 *
 * Every table read this way holds one row per client, per user, or per user-day. 5000 is therefore
 * unreachable for the entity it bounds: a tenant with 5000 client accounts, or 5000 staff, has
 * outgrown considerably more than this query. It stands as a stop against a corrupted or
 * mass-imported table returning unbounded rows, not as a page.
 */
export const REFERENCE_ROWS_CAP = 5000;

/**
 * The ceiling on a filtered list read whose caller passed no `take` of its own.
 *
 * Deliberately far above any page: callers that paginate pass their own `take`, and the handful
 * that do not are scoring or rendering the whole filtered set in memory. Ten thousand candidate
 * rows is already tens of megabytes of JSON held per request — a request that reaches this ceiling
 * has failed either way, and failing with a bounded result beats failing by exhausting the heap.
 * `rows.length === MAX_ROWS_CAP` is the caller's signal that it may have been truncated.
 */
export const MAX_ROWS_CAP = 10_000;
