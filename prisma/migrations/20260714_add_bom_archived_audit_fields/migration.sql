-- AlterTable: Add archivedAt and archivedById columns to Bom
ALTER TABLE "Bom" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Bom" ADD COLUMN "archivedById" TEXT;

-- CreateIndex
CREATE INDEX "Bom_archivedById_idx" ON "Bom"("archivedById");

-- AddForeignKey
ALTER TABLE "Bom" ADD CONSTRAINT "Bom_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
