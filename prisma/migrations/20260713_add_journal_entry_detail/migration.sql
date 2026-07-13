-- CreateTable
CREATE TABLE "JournalEntryDetail" (
    "id" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalEntryDetail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JournalEntryDetail_journalEntryId_idx" ON "JournalEntryDetail"("journalEntryId");

-- CreateIndex
CREATE INDEX "JournalEntryDetail_type_idx" ON "JournalEntryDetail"("type");

-- AddForeignKey
ALTER TABLE "JournalEntryDetail" ADD CONSTRAINT "JournalEntryDetail_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
