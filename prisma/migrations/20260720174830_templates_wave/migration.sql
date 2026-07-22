-- AlterTable
ALTER TABLE "outreach_attempts" ADD COLUMN     "respondedAt" TIMESTAMP(3),
ADD COLUMN     "response" TEXT,
ADD COLUMN     "templateId" TEXT;

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "emailSignature" TEXT,
ADD COLUMN     "stickyNote" TEXT;

-- CreateIndex
CREATE INDEX "outreach_attempts_templateId_idx" ON "outreach_attempts"("templateId");
