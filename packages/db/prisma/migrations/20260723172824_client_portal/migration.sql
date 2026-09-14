-- AlterTable
ALTER TABLE "client_contacts" ADD COLUMN     "portalEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "open_roles" ADD COLUMN     "postedByContactId" TEXT;

-- CreateTable
CREATE TABLE "client_portal_tokens" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "client_portal_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_access_requests" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "requestedClientName" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_access_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_portal_tokens_tokenHash_key" ON "client_portal_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "client_portal_tokens_contactId_idx" ON "client_portal_tokens"("contactId");

-- CreateIndex
CREATE INDEX "portal_access_requests_status_idx" ON "portal_access_requests"("status");

-- AddForeignKey
ALTER TABLE "client_portal_tokens" ADD CONSTRAINT "client_portal_tokens_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "client_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "open_roles" ADD CONSTRAINT "open_roles_postedByContactId_fkey" FOREIGN KEY ("postedByContactId") REFERENCES "client_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
