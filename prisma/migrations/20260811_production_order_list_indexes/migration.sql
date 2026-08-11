-- Migration: index tambahan untuk query list SPK
-- Date: 2026-08-11
-- Plan: docs/plan/2026-08-11-fix-production-orders-list-performance.md
--
-- Halaman /production/orders selalu orderBy createdAt desc, sering filter by
-- status, dan filter "Terlambat" pakai plannedEndDate. Index lama di
-- ProductionOrder (actualEndDate, [updatedAt,status], productionRunId,
-- routeStepId) tidak menutupi pola ini, jadi seq-scan + sort makin berat
-- seiring histori SPK bertambah. CREATE INDEX murni, tidak mengubah data.
--
-- Update 2026-08-11 (verifikasi produksi): EXPLAIN ANALYZE di data produksi
-- nunjukkin query lama (semua SPK + relasi shifts/materialIssues/
-- plannedMaterials/bom.items, tanpa pagination) berat — bukan gara-gara
-- ProductionOrder-nya, tapi karena ProductionShift, MaterialIssue, dan
-- BomItem SAMA SEKALI TIDAK PUNYA index di FK-nya (productionOrderId /
-- bomId), jadi tiap order melakukan seq-scan penuh ke tabel anak itu
-- (loops = jumlah order, di query plan). Query baru (paginated, select
-- dipangkas) jauh lebih cepat, konsisten sebelum-sesudah index ditambah
-- (angka detail: docs/plan/2026-08-11-fix-production-orders-list-performance.md,
-- lokal/gitignored). Ditambah sekalian di sini karena ditemukan dari
-- investigasi yang sama dan levelnya sama-sama "index FK yang tidak pernah
-- ada", bukan perubahan skema baru.
--
-- IF NOT EXISTS dipakai di semua statement karena index ini sempat di-apply
-- manual ke database produksi lebih dulu lewat psql untuk verifikasi
-- EXPLAIN ANALYZE, sebelum migration ini resmi jalan lewat
-- `prisma migrate deploy` di deploy berikutnya — supaya re-apply idempoten,
-- bukan error "already exists".

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProductionOrder_createdAt_idx" ON "ProductionOrder"("createdAt");
CREATE INDEX IF NOT EXISTS "ProductionOrder_status_idx" ON "ProductionOrder"("status");
CREATE INDEX IF NOT EXISTS "ProductionOrder_plannedEndDate_idx" ON "ProductionOrder"("plannedEndDate");
CREATE INDEX IF NOT EXISTS "ProductionShift_productionOrderId_idx" ON "ProductionShift"("productionOrderId");
CREATE INDEX IF NOT EXISTS "MaterialIssue_productionOrderId_idx" ON "MaterialIssue"("productionOrderId");
CREATE INDEX IF NOT EXISTS "BomItem_bomId_idx" ON "BomItem"("bomId");
