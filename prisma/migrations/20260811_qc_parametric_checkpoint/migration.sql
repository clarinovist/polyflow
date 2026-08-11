-- Migration: QC parametrik + link ke ProductionExecution
-- Date: 2026-08-11
-- Plan: docs/plan/2026-08-11-qc-kiosk-parametric-checkpoint.md
--
-- QualityInspection lama cuma punya field result (PASS/FAIL/QUARANTINE) per
-- SPK, tanpa cara mencatat angka ukur aktual (panjang/berat/ketebalan) atau
-- link ke sesi log output (ProductionExecution) mana. Migration ini:
--   1. Tambah QualityCheckParameter — standar kualitas per ProductVariant,
--      dikonfigurasi admin di halaman produk sebelum kiosk bisa nanya apa-apa.
--   2. Tambah QualityInspectionMeasurement — nilai ukur aktual per parameter,
--      snapshot name/unit disimpan supaya histori tidak berubah kalau
--      parameter di-edit/dihapus belakangan.
--   3. Extend QualityInspection dengan productionExecutionId nullable, mirip
--      pola ScrapRecord.productionExecutionId yang sudah ada.
-- Semua tabel/kolom baru nullable/kosong-valid — aman di-apply ke tenant yang
-- belum mendefinisikan parameter QC sama sekali.

-- AlterTable QualityInspection
ALTER TABLE "QualityInspection" ADD COLUMN "productionExecutionId" TEXT;

-- CreateTable QualityCheckParameter
CREATE TABLE "QualityCheckParameter" (
    "id" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "targetValue" DECIMAL(15,4),
    "minValue" DECIMAL(15,4),
    "maxValue" DECIMAL(15,4),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QualityCheckParameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable QualityInspectionMeasurement
CREATE TABLE "QualityInspectionMeasurement" (
    "id" TEXT NOT NULL,
    "qualityInspectionId" TEXT NOT NULL,
    "parameterId" TEXT,
    "parameterName" TEXT NOT NULL,
    "parameterUnit" TEXT NOT NULL,
    "measuredValue" DECIMAL(15,4) NOT NULL,
    "isWithinTolerance" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "QualityInspectionMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QualityInspection_productionExecutionId_idx" ON "QualityInspection"("productionExecutionId");
CREATE INDEX "QualityCheckParameter_productVariantId_idx" ON "QualityCheckParameter"("productVariantId");
CREATE INDEX "QualityInspectionMeasurement_qualityInspectionId_idx" ON "QualityInspectionMeasurement"("qualityInspectionId");
CREATE INDEX "QualityInspectionMeasurement_parameterId_idx" ON "QualityInspectionMeasurement"("parameterId");

-- AddForeignKey
ALTER TABLE "QualityInspection" ADD CONSTRAINT "QualityInspection_productionExecutionId_fkey" FOREIGN KEY ("productionExecutionId") REFERENCES "ProductionExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QualityCheckParameter" ADD CONSTRAINT "QualityCheckParameter_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QualityInspectionMeasurement" ADD CONSTRAINT "QualityInspectionMeasurement_qualityInspectionId_fkey" FOREIGN KEY ("qualityInspectionId") REFERENCES "QualityInspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QualityInspectionMeasurement" ADD CONSTRAINT "QualityInspectionMeasurement_parameterId_fkey" FOREIGN KEY ("parameterId") REFERENCES "QualityCheckParameter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
