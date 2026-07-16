-- Convert Employee from hourly rate to daily rate and add attendance earnings.

BEGIN;

-- 1. Add daily-rate fields to Employee and migrate existing hourlyRate values.
ALTER TABLE "Employee" ADD COLUMN "standardDayHours" DECIMAL(4,2) NOT NULL DEFAULT 8;
ALTER TABLE "Employee" ADD COLUMN "dailyRate" DECIMAL(12,2) NOT NULL DEFAULT 0;
UPDATE "Employee" SET "dailyRate" = "hourlyRate" * 8;
ALTER TABLE "Employee" DROP COLUMN "hourlyRate";
ALTER TABLE "Employee" ADD COLUMN "overtimeHourlyRate" DECIMAL(12,2);

-- 2. Add earnings/hours snapshots to AttendanceRecord.
ALTER TABLE "AttendanceRecord" ADD COLUMN "plannedHours" DECIMAL(4,2);
ALTER TABLE "AttendanceRecord" ADD COLUMN "actualHours" DECIMAL(5,2);
ALTER TABLE "AttendanceRecord" ADD COLUMN "regularHours" DECIMAL(5,2);
ALTER TABLE "AttendanceRecord" ADD COLUMN "overtimeHours" DECIMAL(5,2);
ALTER TABLE "AttendanceRecord" ADD COLUMN "standardDayHours" DECIMAL(4,2);
ALTER TABLE "AttendanceRecord" ADD COLUMN "dailyRateSnapshot" DECIMAL(12,2);
ALTER TABLE "AttendanceRecord" ADD COLUMN "overtimeRateSnapshot" DECIMAL(12,2);
ALTER TABLE "AttendanceRecord" ADD COLUMN "dailyEarnings" DECIMAL(12,2);
ALTER TABLE "AttendanceRecord" ADD COLUMN "overtimeEarnings" DECIMAL(12,2);
ALTER TABLE "AttendanceRecord" ADD COLUMN "totalEarnings" DECIMAL(12,2);

COMMIT;
