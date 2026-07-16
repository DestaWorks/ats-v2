-- AlterTable
ALTER TABLE "client_rules" ADD COLUMN     "schedule" TEXT;

-- CreateTable
CREATE TABLE "screening_scorecards" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "clientId" TEXT,
    "credentialsHeld" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "statesHeld" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "yearsExp" INTEGER,
    "schedule" TEXT,
    "salaryAsk" INTEGER,
    "commChecklist" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "credScore" INTEGER NOT NULL,
    "stateScore" INTEGER NOT NULL,
    "expScore" INTEGER NOT NULL,
    "scheduleScore" INTEGER NOT NULL,
    "salaryScore" INTEGER NOT NULL,
    "commScore" INTEGER NOT NULL,
    "totalPct" INTEGER NOT NULL,
    "decision" TEXT NOT NULL,
    "notes" TEXT,
    "scoredById" TEXT NOT NULL,
    "scoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "screening_scorecards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "screening_scorecards_candidateId_scoredAt_idx" ON "screening_scorecards"("candidateId", "scoredAt");

-- AddForeignKey
ALTER TABLE "screening_scorecards" ADD CONSTRAINT "screening_scorecards_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
