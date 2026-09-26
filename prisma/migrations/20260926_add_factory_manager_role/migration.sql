-- AlterEnum: Add FACTORY_MANAGER to Role enum
-- Kepala pabrik: read-only lintas bagian (produksi, stok operasional, progres PR/PO).
-- Tidak memberi hak transaksi komersial/finansial; permission detail diatur RolePermission.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'FACTORY_MANAGER';
