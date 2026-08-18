-- DropIndex
DROP INDEX "candidates_email_trgm_idx";

-- DropIndex
DROP INDEX "candidates_name_trgm_idx";

-- DropIndex
DROP INDEX "prospects_practicename_trgm_idx";

-- CreateTable
CREATE TABLE "ai_usage_event" (
    "id" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "latencyMs" INTEGER NOT NULL,
    "errorName" TEXT,
    "errorStatusCode" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_usage_event_operation_createdAt_idx" ON "ai_usage_event"("operation", "createdAt");

-- CreateIndex
CREATE INDEX "ai_usage_event_createdAt_idx" ON "ai_usage_event"("createdAt");
