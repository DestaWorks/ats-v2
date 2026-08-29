import type { DailyBrief, Prisma, WeeklyBrief } from "../generated/prisma/client";
import { db } from "../prisma";

export type DailyBriefRow = DailyBrief;
export type WeeklyBriefRow = WeeklyBrief;

/**
 * Daily/Weekly Brief data access (Wave 5.1) — one row per period (`date`/`weekStart`), upserted
 * on save. Mirrors `daily.repository.ts`'s target/actual CRUD shape.
 */
export const briefRepository = {
  findDailyByDate(date: string, tx?: Prisma.TransactionClient) {
    return db(tx).dailyBrief.findUnique({ where: { date } });
  },
  upsertDaily(data: Prisma.DailyBriefUncheckedCreateInput, tx?: Prisma.TransactionClient) {
    const { date, ...rest } = data;
    return db(tx).dailyBrief.upsert({ where: { date }, create: data, update: rest });
  },
  listDaily(take: number, tx?: Prisma.TransactionClient) {
    return db(tx).dailyBrief.findMany({ orderBy: { date: "desc" }, take });
  },
  /**
   * Park the generate job's AI output beside — never over — the saved brief. The update touches
   * only the two draft columns, so a job that lands after someone saved that day's brief leaves
   * their work intact and simply offers a newer draft next to it.
   */
  upsertDailyDraft(date: string, draft: Prisma.InputJsonValue, tx?: Prisma.TransactionClient) {
    const draftAt = new Date();
    return db(tx).dailyBrief.upsert({
      where: { date },
      create: { date, draft, draftAt },
      update: { draft, draftAt },
    });
  },

  findWeeklyByWeekStart(weekStart: string, tx?: Prisma.TransactionClient) {
    return db(tx).weeklyBrief.findUnique({ where: { weekStart } });
  },
  upsertWeekly(data: Prisma.WeeklyBriefUncheckedCreateInput, tx?: Prisma.TransactionClient) {
    const { weekStart, ...rest } = data;
    return db(tx).weeklyBrief.upsert({ where: { weekStart }, create: data, update: rest });
  },
  listWeekly(take: number, tx?: Prisma.TransactionClient) {
    return db(tx).weeklyBrief.findMany({ orderBy: { weekStart: "desc" }, take });
  },
  /** See `upsertDailyDraft` — same reasoning, weekly period. */
  upsertWeeklyDraft(
    weekStart: string,
    draft: Prisma.InputJsonValue,
    tx?: Prisma.TransactionClient,
  ) {
    const draftAt = new Date();
    return db(tx).weeklyBrief.upsert({
      where: { weekStart },
      create: { weekStart, draft, draftAt },
      update: { draft, draftAt },
    });
  },
};
