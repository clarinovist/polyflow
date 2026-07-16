-- AlterTable
ALTER TABLE "AttendanceRecord" ADD COLUMN IF NOT EXISTS "clockInPhotoUrl" TEXT;
ALTER TABLE "AttendanceRecord" ADD COLUMN IF NOT EXISTS "clockOutPhotoUrl" TEXT;
