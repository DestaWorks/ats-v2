-- CreateTable
CREATE TABLE "client_rules" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "states" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "creds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pops" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "settings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "priority" TEXT,
    "autoDisqualify" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_rules_clientId_key" ON "client_rules"("clientId");

-- CreateIndex
CREATE INDEX "client_rules_clientId_idx" ON "client_rules"("clientId");

-- AddForeignKey
ALTER TABLE "client_rules" ADD CONSTRAINT "client_rules_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
