-- CreateTable
CREATE TABLE "source_leads" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "linkedinUrl" TEXT,
    "credential" TEXT,
    "state" TEXT,
    "source" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "clientId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Sourced',
    "outreachCount" INTEGER NOT NULL DEFAULT 0,
    "lastOutreachAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "promotedCandidateId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,

    CONSTRAINT "source_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_attempts" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "leadId" TEXT,
    "candidateId" TEXT,
    "channel" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outreach_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "source_leads_legacyId_key" ON "source_leads"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "source_leads_promotedCandidateId_key" ON "source_leads"("promotedCandidateId");

-- CreateIndex
CREATE INDEX "source_leads_status_idx" ON "source_leads"("status");

-- CreateIndex
CREATE INDEX "source_leads_deletedAt_idx" ON "source_leads"("deletedAt");

-- CreateIndex
CREATE INDEX "source_leads_email_idx" ON "source_leads"("email");

-- CreateIndex
CREATE INDEX "source_leads_clientId_idx" ON "source_leads"("clientId");

-- CreateIndex
CREATE INDEX "source_leads_deletedAt_createdAt_id_idx" ON "source_leads"("deletedAt", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "outreach_attempts_legacyId_key" ON "outreach_attempts"("legacyId");

-- CreateIndex
CREATE INDEX "outreach_attempts_leadId_idx" ON "outreach_attempts"("leadId");

-- CreateIndex
CREATE INDEX "outreach_attempts_candidateId_idx" ON "outreach_attempts"("candidateId");

-- CreateIndex
CREATE INDEX "outreach_attempts_actorId_at_idx" ON "outreach_attempts"("actorId", "at");

-- AddForeignKey
ALTER TABLE "source_leads" ADD CONSTRAINT "source_leads_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_leads" ADD CONSTRAINT "source_leads_promotedCandidateId_fkey" FOREIGN KEY ("promotedCandidateId") REFERENCES "candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_attempts" ADD CONSTRAINT "outreach_attempts_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "source_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_attempts" ADD CONSTRAINT "outreach_attempts_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
