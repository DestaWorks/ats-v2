-- Data migration: the note-type vocabulary expands from the interim {internal, external} pair to
-- the legacy 5-way {internal, client, call, email, text}. "external" (client-facing) maps to
-- "client"; "internal" is unchanged. No other values exist (zod has bounded writes since Wave 2.2).
UPDATE "candidate_notes" SET "noteType" = 'client' WHERE "noteType" = 'external';

-- CreateTable
CREATE TABLE "mentions" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "mentions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mentions_recipientId_readAt_idx" ON "mentions"("recipientId", "readAt");

-- AddForeignKey
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "candidate_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
