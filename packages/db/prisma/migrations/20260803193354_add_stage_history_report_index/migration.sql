-- DropIndex
DROP INDEX "candidates_email_trgm_idx";

-- DropIndex
DROP INDEX "candidates_name_trgm_idx";

-- CreateIndex
CREATE INDEX "stage_history_enteredAt_toStageOrder_candidateId_idx" ON "stage_history"("enteredAt", "toStageOrder", "candidateId");
