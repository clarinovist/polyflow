-- Jadwal Kirim: Add ACTIVE + CLOSED to ScheduleStatus enum
-- IMPORTANT: ALTER TYPE ... ADD VALUE cannot run inside a transaction.
-- This file must be applied OUTSIDE a transaction block.
-- Run manually via psql or use: npx prisma@5.22.0 migrate deploy
-- (Prisma will apply this as a separate statement if marked correctly)

ALTER TYPE "ScheduleStatus" ADD VALUE IF NOT EXISTS 'ACTIVE';
ALTER TYPE "ScheduleStatus" ADD VALUE IF NOT EXISTS 'CLOSED';
