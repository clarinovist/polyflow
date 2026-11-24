-- Additive: tujuan kunjungan sales (diisi saat check-in). Kolom nullable tanpa default,
-- tanpa backfill; baris dan antrean offline lama tanpa tujuan tetap sah.

-- AlterTable
ALTER TABLE "SalesVisit" ADD COLUMN "purpose" TEXT;
