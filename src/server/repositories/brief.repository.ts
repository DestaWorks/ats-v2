import "server-only";
import type { DailyBrief, Prisma, WeeklyBrief } from "@/generated/prisma/client";
import { db } from "@/server/db/prisma";

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
};
