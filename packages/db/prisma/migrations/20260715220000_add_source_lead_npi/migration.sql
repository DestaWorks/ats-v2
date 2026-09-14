-- AlterTable
ALTER TABLE "source_leads" ADD COLUMN     "npi" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "source_leads_npi_key" ON "source_leads"("npi");
