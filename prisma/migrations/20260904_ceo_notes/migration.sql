-- Migration: CEO Notes — otak pertama terjadwal (catatan + memori per tenant).
-- Tabel baru CeoNote + CeoNoteEvent + CeoNoteComment; tabel Finding dibiarkan
-- sebagai lapisan bahan mentah (tidak di-rename).
-- plan: docs/plan/2026-09-04-ceo-notes-otak-memori.md
-- Date: 2026-09-04

-- CreateEnum
CREATE TYPE "CeoNoteStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLAIMED', 'BLOCKED', 'RESOLVED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "CeoNotePriority" AS ENUM ('CRITICAL', 'NORMAL');

-- CreateEnum
CREATE TYPE "CeoNoteOrigin" AS ENUM ('AI', 'MANUAL');

-- CreateTable
CREATE TABLE "CeoNote" (
    "id" TEXT NOT NULL,
    "origin" "CeoNoteOrigin" NOT NULL DEFAULT 'AI',
    "status" "CeoNoteStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" "CeoNotePriority" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "suggestedSteps" TEXT[],
    "sourceDetectors" TEXT[],
    "sourceFingerprints" TEXT[],
    "aiModel" TEXT,
    "aiGeneratedAt" TIMESTAMP(3),
    "editedByCeo" BOOLEAN NOT NULL DEFAULT false,
    "assignedUserIds" TEXT[],
    "assignedRoles" TEXT[],
    "requiredResources" TEXT[],
    "dueAt" TIMESTAMP(3),
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remindedAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "claimedById" TEXT,
    "claimedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CeoNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CeoNoteEvent" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CeoNoteEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CeoNoteComment" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CeoNoteComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CeoNote_status_priority_idx" ON "CeoNote"("status", "priority");

-- CreateIndex
CREATE INDEX "CeoNote_status_publishedAt_idx" ON "CeoNote"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "CeoNote_claimedById_idx" ON "CeoNote"("claimedById");

-- CreateIndex
CREATE INDEX "CeoNoteEvent_noteId_createdAt_idx" ON "CeoNoteEvent"("noteId", "createdAt");

-- CreateIndex
CREATE INDEX "CeoNoteComment_noteId_createdAt_idx" ON "CeoNoteComment"("noteId", "createdAt");

-- AddForeignKey
ALTER TABLE "CeoNote" ADD CONSTRAINT "CeoNote_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CeoNote" ADD CONSTRAINT "CeoNote_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CeoNoteEvent" ADD CONSTRAINT "CeoNoteEvent_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "CeoNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CeoNoteComment" ADD CONSTRAINT "CeoNoteComment_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "CeoNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
