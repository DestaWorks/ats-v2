-- DropIndex
DROP INDEX "candidates_email_trgm_idx";

-- DropIndex
DROP INDEX "candidates_name_trgm_idx";

-- CreateTable
CREATE TABLE "prospects" (
    "id" TEXT NOT NULL,
    "practiceName" TEXT NOT NULL,
    "npi" TEXT,
    "taxonomy" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Fresh Lead',
    "ownerId" TEXT,
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'NPPES Search',
    "icpId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,

    CONSTRAINT "prospects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prospect_contacts" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "title" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "linkedinUrl" TEXT,
    "seniority" TEXT,
    "source" TEXT NOT NULL DEFAULT 'Manual',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "prospect_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_icps" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxonomy" TEXT,
    "state" TEXT,
    "city" TEXT,
    "zip" TEXT,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_icps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "prospects_npi_key" ON "prospects"("npi");

-- CreateIndex
CREATE INDEX "prospects_status_idx" ON "prospects"("status");

-- CreateIndex
CREATE INDEX "prospects_deletedAt_idx" ON "prospects"("deletedAt");

-- CreateIndex
CREATE INDEX "prospects_ownerId_idx" ON "prospects"("ownerId");

-- CreateIndex
CREATE INDEX "prospects_deletedAt_createdAt_id_idx" ON "prospects"("deletedAt", "createdAt", "id");

-- CreateIndex
CREATE INDEX "prospect_contacts_prospectId_idx" ON "prospect_contacts"("prospectId");

-- CreateIndex
CREATE INDEX "saved_icps_userId_idx" ON "saved_icps"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "saved_icps_userId_name_key" ON "saved_icps"("userId", "name");

-- AddForeignKey
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_icpId_fkey" FOREIGN KEY ("icpId") REFERENCES "saved_icps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospect_contacts" ADD CONSTRAINT "prospect_contacts_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_icps" ADD CONSTRAINT "saved_icps_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
