-- CreateIndex
CREATE UNIQUE INDEX "StockOpname_locationId_open_key" ON "StockOpname"("locationId") WHERE status = 'OPEN';
