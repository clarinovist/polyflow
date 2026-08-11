-- Migration: index tambahan untuk query list SPK
-- Date: 2026-08-11
-- Plan: docs/plan/2026-08-11-fix-production-orders-list-performance.md
--
-- Halaman /production/orders selalu orderBy createdAt desc, sering filter by
-- status, dan filter "Terlambat" pakai plannedEndDate. Index lama di
-- ProductionOrder (actualEndDate, [updatedAt,status], productionRunId,
-- routeStepId) tidak menutupi pola ini, jadi seq-scan + sort makin berat
-- seiring histori SPK bertambah. CREATE INDEX murni, tidak mengubah data.

-- CreateIndex
CREATE INDEX "ProductionOrder_createdAt_idx" ON "ProductionOrder"("createdAt");
CREATE INDEX "ProductionOrder_status_idx" ON "ProductionOrder"("status");
CREATE INDEX "ProductionOrder_plannedEndDate_idx" ON "ProductionOrder"("plannedEndDate");
