-- AlterTable
ALTER TABLE "candidates" ADD COLUMN     "filledFromRoleId" TEXT;

-- CreateTable
CREATE TABLE "open_roles" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "credential" TEXT,
    "state" TEXT,
    "city" TEXT,
    "setting" TEXT,
    "population" TEXT,
    "rate" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "priority" TEXT NOT NULL DEFAULT 'P2',
    "assignedToId" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "open_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_notes" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT,
    "category" TEXT NOT NULL DEFAULT 'General',
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,

    CONSTRAINT "role_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_match_profiles" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "weightSameClient" INTEGER NOT NULL DEFAULT 30,
    "weightSameState" INTEGER NOT NULL DEFAULT 25,
    "weightCredExact" INTEGER NOT NULL DEFAULT 25,
    "weightCredPartial" INTEGER NOT NULL DEFAULT 15,
    "weightRespondedHot" INTEGER NOT NULL DEFAULT 20,
    "weightOutreach" INTEGER NOT NULL DEFAULT 10,
    "weightSourced" INTEGER NOT NULL DEFAULT 5,
    "penaltyCold" INTEGER NOT NULL DEFAULT 10,
    "minScore" INTEGER NOT NULL DEFAULT 25,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_match_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "open_roles_legacyId_key" ON "open_roles"("legacyId");

-- CreateIndex
CREATE INDEX "open_roles_clientId_idx" ON "open_roles"("clientId");

-- CreateIndex
CREATE INDEX "open_roles_status_idx" ON "open_roles"("status");

-- CreateIndex
CREATE INDEX "open_roles_status_priority_idx" ON "open_roles"("status", "priority");

-- CreateIndex
CREATE INDEX "role_notes_roleId_idx" ON "role_notes"("roleId");

-- CreateIndex
CREATE INDEX "role_notes_roleId_createdAt_idx" ON "role_notes"("roleId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "client_match_profiles_clientId_key" ON "client_match_profiles"("clientId");

-- CreateIndex
CREATE INDEX "candidates_filledFromRoleId_idx" ON "candidates"("filledFromRoleId");

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_filledFromRoleId_fkey" FOREIGN KEY ("filledFromRoleId") REFERENCES "open_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "open_roles" ADD CONSTRAINT "open_roles_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_notes" ADD CONSTRAINT "role_notes_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "open_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_match_profiles" ADD CONSTRAINT "client_match_profiles_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
