-- CreateIndex
CREATE INDEX "candidates_deletedAt_createdAt_id_idx" ON "candidates"("deletedAt", "createdAt", "id");

-- CreateIndex
CREATE INDEX "candidates_status_deletedAt_createdAt_id_idx" ON "candidates"("status", "deletedAt", "createdAt", "id");

-- CreateIndex
CREATE INDEX "candidates_status_deletedAt_stageEnteredAt_idx" ON "candidates"("status", "deletedAt", "stageEnteredAt");
