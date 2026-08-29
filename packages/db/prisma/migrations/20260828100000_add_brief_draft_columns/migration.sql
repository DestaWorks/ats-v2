-- Phase 5: brief generation moved off the request path into a job, so the AI draft now has to be
-- stored rather than returned. It gets its own columns instead of the existing brief fields so a
-- job that finishes late cannot overwrite a brief a human already saved for the same period.

-- AlterTable
ALTER TABLE "daily_briefs" ADD COLUMN     "draft" JSONB,
ADD COLUMN     "draftAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "weekly_briefs" ADD COLUMN     "draft" JSONB,
ADD COLUMN     "draftAt" TIMESTAMP(3);
