-- AlterTable
ALTER TABLE "source_leads" ADD COLUMN     "lastOutreachChannel" TEXT;

-- Backfill from the newest attempt per lead (denorm catch-up).
UPDATE "source_leads" SET "lastOutreachChannel" = (
  SELECT a."channel" FROM "outreach_attempts" a
  WHERE a."leadId" = "source_leads"."id"
  ORDER BY a."at" DESC, a."id" DESC LIMIT 1
);
