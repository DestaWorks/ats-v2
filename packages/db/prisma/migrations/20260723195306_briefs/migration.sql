-- CreateTable
CREATE TABLE "daily_briefs" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "headline" TEXT,
    "exceptions" JSONB,
    "yesterdayCheck" JSONB,
    "clientCards" JSONB,
    "perAssociate" JSONB,
    "teamPulse" TEXT,
    "priorityClientId" TEXT,
    "shiftA" TEXT,
    "shiftB" TEXT,
    "watchItems" TEXT,
    "savedById" TEXT,
    "savedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_briefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_briefs" (
    "id" TEXT NOT NULL,
    "weekStart" TEXT NOT NULL,
    "headline" TEXT,
    "kpiNarrative" TEXT,
    "clientCards" JSONB,
    "perAssociate" JSONB,
    "lastWeekCheck" JSONB,
    "decisions" JSONB,
    "highlights" TEXT,
    "blockers" TEXT,
    "nextWeekPriorities" TEXT,
    "statsSnapshot" JSONB,
    "savedById" TEXT,
    "savedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_briefs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_briefs_date_key" ON "daily_briefs"("date");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_briefs_weekStart_key" ON "weekly_briefs"("weekStart");
