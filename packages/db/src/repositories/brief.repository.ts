import type { TenantContext } from "@destaworks/domain/tenant";
import type { DailyBrief, Prisma, WeeklyBrief } from "../generated/prisma/client";
import { bridgeUnscopedCallers, db, type ScopedTx } from "../tenant-scope";

export type DailyBriefRow = DailyBrief;
export type WeeklyBriefRow = WeeklyBrief;

/**
 * Daily/Weekly Brief data access (Wave 5.1) — one row per period (`date`/`weekStart`), upserted
 * on save. Mirrors `daily.repository.ts`'s target/actual CRUD shape.
 */
export const briefRepository = bridgeUnscopedCallers({
  findDailyByDate(ctx: TenantContext, date: string, tx?: ScopedTx) {
    return db(ctx, tx).dailyBrief.findUnique({ where: { date } });
  },
  upsertDaily(ctx: TenantContext, data: Prisma.DailyBriefUncheckedCreateInput, tx?: ScopedTx) {
    const { date, ...rest } = data;
    return db(ctx, tx).dailyBrief.upsert({ where: { date }, create: data, update: rest });
  },
  listDaily(ctx: TenantContext, take: number, tx?: ScopedTx) {
    return db(ctx, tx).dailyBrief.findMany({ orderBy: { date: "desc" }, take });
  },
  /**
   * Park the generate job's AI output beside — never over — the saved brief. The update touches
   * only the two draft columns, so a job that lands after someone saved that day's brief leaves
   * their work intact and simply offers a newer draft next to it.
   */
  upsertDailyDraft(ctx: TenantContext, date: string, draft: Prisma.InputJsonValue, tx?: ScopedTx) {
    const draftAt = new Date();
    return db(ctx, tx).dailyBrief.upsert({
      where: { date },
      create: { date, draft, draftAt },
      update: { draft, draftAt },
    });
  },

  findWeeklyByWeekStart(ctx: TenantContext, weekStart: string, tx?: ScopedTx) {
    return db(ctx, tx).weeklyBrief.findUnique({ where: { weekStart } });
  },
  upsertWeekly(ctx: TenantContext, data: Prisma.WeeklyBriefUncheckedCreateInput, tx?: ScopedTx) {
    const { weekStart, ...rest } = data;
    return db(ctx, tx).weeklyBrief.upsert({ where: { weekStart }, create: data, update: rest });
  },
  listWeekly(ctx: TenantContext, take: number, tx?: ScopedTx) {
    return db(ctx, tx).weeklyBrief.findMany({ orderBy: { weekStart: "desc" }, take });
  },
  /** See `upsertDailyDraft` — same reasoning, weekly period. */
  upsertWeeklyDraft(
    ctx: TenantContext,
    weekStart: string,
    draft: Prisma.InputJsonValue,
    tx?: ScopedTx,
  ) {
    const draftAt = new Date();
    return db(ctx, tx).weeklyBrief.upsert({
      where: { weekStart },
      create: { weekStart, draft, draftAt },
      update: { draft, draftAt },
    });
  },
});
