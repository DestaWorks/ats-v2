-- Phase 5: the ETL commit leaves the request path. One row per asynchronous commit run — the
-- staged upload, the resume marker, and the operator-visible status.
--
-- Hand-written rather than diffed, on purpose: `prisma migrate dev` proposes dropping the three
-- GIN trigram indexes (they are raw SQL, absent from schema.prisma, and therefore read as drift).
-- This migration touches nothing but the new table, so they survive untouched.

-- CreateTable
CREATE TABLE "migration_runs" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "processedRows" INTEGER NOT NULL DEFAULT 0,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "checksum" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "filename" TEXT,
    "extractWithAi" BOOLEAN NOT NULL DEFAULT false,
    "content" TEXT,
    "resumes" JSONB,
    "report" JSONB,
    "failureCode" TEXT,
    "startedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "migration_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "migration_runs_status_createdAt_idx" ON "migration_runs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "migration_runs_startedById_createdAt_idx" ON "migration_runs"("startedById", "createdAt");
