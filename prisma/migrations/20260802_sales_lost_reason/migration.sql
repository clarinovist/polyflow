-- Migration: Lost reason for rejected quotations
-- Date: 2026-08-02

CREATE TYPE "SalesLostReason" AS ENUM (
  'HARGA_TERLALU_TINGGI', 'STOK_TIDAK_TERSEDIA', 'WAKTU_KIRIM',
  'PINDAH_KOMPETITOR', 'BATAL_KEBUTUHAN', 'LAINNYA'
);

ALTER TABLE "SalesOrder"
  ADD COLUMN "lostReason" "SalesLostReason",
  ADD COLUMN "lostReasonNotes" TEXT;
