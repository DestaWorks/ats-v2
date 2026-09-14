-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "name" TEXT NOT NULL,
    "capacity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidates" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "city" TEXT,
    "state" TEXT,
    "employer" TEXT,
    "yearsExp" INTEGER,
    "credential" TEXT,
    "population" TEXT,
    "setting" TEXT,
    "track" TEXT NOT NULL DEFAULT 'Clinical',
    "source" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "outreachAttempts" INTEGER NOT NULL DEFAULT 0,
    "licenseState" TEXT,
    "licenseNumber" TEXT,
    "licenseStatus" TEXT NOT NULL DEFAULT 'Not Verified',
    "licenseExpiry" TIMESTAMP(3),
    "licenseVerifiedAt" TIMESTAMP(3),
    "licenseVerifiedById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW_CANDIDATE',
    "stageOrder" INTEGER NOT NULL DEFAULT 0,
    "stageEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "placedAt" TIMESTAMP(3),
    "clientId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage_history" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "fromStageOrder" INTEGER,
    "toStageOrder" INTEGER NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT NOT NULL,

    CONSTRAINT "stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clients_legacyId_key" ON "clients"("legacyId");

-- CreateIndex
CREATE INDEX "clients_deletedAt_idx" ON "clients"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "candidates_legacyId_key" ON "candidates"("legacyId");

-- CreateIndex
CREATE INDEX "candidates_status_idx" ON "candidates"("status");

-- CreateIndex
CREATE INDEX "candidates_clientId_idx" ON "candidates"("clientId");

-- CreateIndex
CREATE INDEX "candidates_deletedAt_idx" ON "candidates"("deletedAt");

-- CreateIndex
CREATE INDEX "candidates_licenseExpiry_idx" ON "candidates"("licenseExpiry");

-- CreateIndex
CREATE INDEX "candidates_status_deletedAt_idx" ON "candidates"("status", "deletedAt");

-- CreateIndex
CREATE INDEX "candidates_email_idx" ON "candidates"("email");

-- CreateIndex
CREATE INDEX "stage_history_candidateId_idx" ON "stage_history"("candidateId");

-- CreateIndex
CREATE INDEX "stage_history_candidateId_enteredAt_idx" ON "stage_history"("candidateId", "enteredAt");

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_history" ADD CONSTRAINT "stage_history_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
