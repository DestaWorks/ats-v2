-- CreateIndex
CREATE INDEX "activity_log_at_id_idx" ON "activity_log"("at", "id");

-- CreateIndex
CREATE INDEX "activity_log_action_at_id_idx" ON "activity_log"("action", "at", "id");
