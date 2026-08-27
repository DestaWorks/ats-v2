-- CreateTable
CREATE TABLE "manager_feedback" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT,
    "targetUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manager_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "manager_feedback_targetUserId_createdAt_idx" ON "manager_feedback"("targetUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "manager_feedback" ADD CONSTRAINT "manager_feedback_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
