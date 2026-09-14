-- CreateTable
CREATE TABLE "ai_settings" (
    "id" TEXT NOT NULL,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "ai_settings_pkey" PRIMARY KEY ("id")
);
