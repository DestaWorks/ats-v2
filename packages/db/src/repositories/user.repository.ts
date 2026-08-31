import type { Prisma } from "../generated/prisma/client";
import { db } from "../prisma";
import { REFERENCE_ROWS_CAP } from "../query-limits";

/**
 * Minimal read access to the Better Auth `User` table for resolving actor ids → display names.
 * The ONLY layer that touches Prisma for users. Kept intentionally small + reusable: the same
 * `namesByIds` also serves stage-history / notes actor-name resolution later. Reads no PII beyond
 * the display name.
 */
export const userRepository = {
  /**
   * Batch-resolve a set of user ids to their display names in ONE query. De-dupes the input,
   * short-circuits on an empty set (no query), and returns a `Map<id, name>` — callers fall back
   * to a placeholder ("Unknown") for an id absent from the map (e.g. a since-removed user).
   */
  async namesByIds(ids: string[], tx?: Prisma.TransactionClient): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await db(tx).user.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((r) => [r.id, r.name] as const));
  },

  /**
   * All users as `{ id, name }` options, sorted by name — feeds the "view as owner" filter
   * dropdown. Display names only (no email/PII); the user table is small (fixed team).
   */
  list(tx?: Prisma.TransactionClient) {
    return db(tx).user.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: REFERENCE_ROWS_CAP,
    });
  },

  /** Case-insensitive email lookup — `id` only, for existence checks (e.g. access-request
   *  approval must not try to create a second account for an already-registered email). */
  findByEmail(email: string, tx?: Prisma.TransactionClient) {
    return db(tx).user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });
  },

  /**
   * The identity fields a BACKGROUND job needs to re-establish who it is acting as. A job runs
   * long after the request that queued it, so it cannot carry a session; it carries an actor id
   * and reads the current record here.
   *
   * Identity only — no role. The job's authority is the actor's `Membership` in the tenant the
   * queued row names, read fresh by the caller, so a user who lost the capability between enqueue
   * and run cannot still be running with the old one.
   */
  findActorById(id: string, tx?: Prisma.TransactionClient) {
    return db(tx).user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true },
    });
  },

  /** Batch-resolve a set of user ids to their emails in ONE query — mirrors `namesByIds`. Used
   *  ONLY server-side (e.g. mention notification emails); `list()` deliberately never selects
   *  email since its result feeds the client-side @mention picker. */
  async emailsByIds(ids: string[], tx?: Prisma.TransactionClient): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await db(tx).user.findMany({
      where: { id: { in: unique } },
      select: { id: true, email: true },
    });
    return new Map(rows.map((r) => [r.id, r.email] as const));
  },

  /** Display name + account creation date for one user — the tenure basis the Daily Log /
   *  Brief ramp math keys off (`tenureWeek(createdAt, date)`). Name only, no other PII. */
  findTenureBasis(userId: string, tx?: Prisma.TransactionClient) {
    return db(tx).user.findUnique({
      where: { id: userId },
      select: { name: true, createdAt: true },
    });
  },

  /** Wave 4.1 (Templates) + Wave 5.4 (My Profile) — one user's self-service profile fields. */
  findPreferences(userId: string, tx?: Prisma.TransactionClient) {
    return db(tx).user.findUnique({
      where: { id: userId },
      select: {
        emailSignature: true,
        stickyNote: true,
        bio: true,
        phone: true,
        location: true,
      },
    });
  },

  /** Own-record only (callers always pass the session user's own id). */
  updatePreferences(
    userId: string,
    data: {
      emailSignature?: string | null;
      stickyNote?: string | null;
      bio?: string | null;
      phone?: string | null;
      location?: string | null;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return db(tx).user.update({
      where: { id: userId },
      data,
      select: {
        emailSignature: true,
        stickyNote: true,
        bio: true,
        phone: true,
        location: true,
      },
    });
  },

  /** Wave 5.4 (Learn tutorial) — the signed-in user's per-chapter completion map. */
  async getLearnProgress(
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Record<string, string>> {
    const row = await db(tx).user.findUnique({
      where: { id: userId },
      select: { learnProgress: true },
    });
    return (row?.learnProgress as Record<string, string> | undefined) ?? {};
  },

  /** Own-record only. `done: false` removes the chapter's entry entirely. */
  async setChapterProgress(
    userId: string,
    chapterId: string,
    done: boolean,
    tx?: Prisma.TransactionClient,
  ): Promise<Record<string, string>> {
    const current = await userRepository.getLearnProgress(userId, tx);
    const next = { ...current };
    if (done) next[chapterId] = new Date().toISOString();
    else delete next[chapterId];
    const row = await db(tx).user.update({
      where: { id: userId },
      data: { learnProgress: next },
      select: { learnProgress: true },
    });
    return row.learnProgress as Record<string, string>;
  },
};
