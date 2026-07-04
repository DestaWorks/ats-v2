-- CreateTable
CREATE TABLE "candidate_notes" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "candidateId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT,
    "body" TEXT NOT NULL,
    "noteType" TEXT NOT NULL DEFAULT 'internal',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,

    CONSTRAINT "candidate_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "candidate_notes_legacyId_key" ON "candidate_notes"("legacyId");

-- CreateIndex
CREATE INDEX "candidate_notes_candidateId_idx" ON "candidate_notes"("candidateId");

-- CreateIndex
CREATE INDEX "candidate_notes_candidateId_createdAt_idx" ON "candidate_notes"("candidateId", "createdAt");

-- CreateIndex
CREATE INDEX "candidate_notes_deletedAt_idx" ON "candidate_notes"("deletedAt");

-- AddForeignKey
ALTER TABLE "candidate_notes" ADD CONSTRAINT "candidate_notes_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
