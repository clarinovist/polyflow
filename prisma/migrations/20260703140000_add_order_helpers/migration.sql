-- CreateTable
CREATE TABLE "_OrderHelpers" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_OrderHelpers_AB_unique" ON "_OrderHelpers"("A", "B");

-- CreateIndex
CREATE INDEX "_OrderHelpers_B_index" ON "_OrderHelpers"("B");

-- AddForeignKey
ALTER TABLE "_OrderHelpers" ADD CONSTRAINT "_OrderHelpers_A_fkey" FOREIGN KEY ("A") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OrderHelpers" ADD CONSTRAINT "_OrderHelpers_B_fkey" FOREIGN KEY ("B") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
