-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "cadence" TEXT,
ADD COLUMN     "contact" TEXT,
ADD COLUMN     "contractStart" TIMESTAMP(3),
ADD COLUMN     "location" TEXT,
ADD COLUMN     "priority" TEXT,
ADD COLUMN     "renewalDate" TIMESTAMP(3),
ADD COLUMN     "schedule" TEXT,
ADD COLUMN     "services" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "specialties" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "states" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "client_contacts" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "title" TEXT,
    "role" TEXT NOT NULL DEFAULT 'unknown',
    "email" TEXT,
    "phone" TEXT,
    "linkedin" TEXT,
    "reportsTo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,

    CONSTRAINT "client_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_contacts_clientId_idx" ON "client_contacts"("clientId");

-- AddForeignKey
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
