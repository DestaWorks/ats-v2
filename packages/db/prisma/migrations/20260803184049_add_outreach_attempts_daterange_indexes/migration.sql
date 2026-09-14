-- CreateIndex
CREATE INDEX "outreach_attempts_at_actorId_idx" ON "outreach_attempts"("at", "actorId");

-- CreateIndex
CREATE INDEX "outreach_attempts_respondedAt_actorId_idx" ON "outreach_attempts"("respondedAt", "actorId");
