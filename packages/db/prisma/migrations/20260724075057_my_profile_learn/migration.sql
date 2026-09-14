-- AlterTable
ALTER TABLE "user" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "learnProgress" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "location" TEXT,
ADD COLUMN     "phone" TEXT;
