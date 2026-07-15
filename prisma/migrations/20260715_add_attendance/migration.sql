-- Add AttendanceRecord model, pinHash to Employee, plannedHours to WorkShift

-- AlterTable: Employee
ALTER TABLE "Employee" ADD COLUMN "pinHash" TEXT;

-- AlterTable: WorkShift
ALTER TABLE "WorkShift" ADD COLUMN "plannedHours" DECIMAL(4,2);

-- CreateEnum: AttendanceStatus
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'ON_LEAVE');

-- CreateEnum: AttendanceSource
CREATE TYPE "AttendanceSource" AS ENUM ('KIOSK', 'MANUAL');

-- CreateTable: AttendanceRecord
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "workShiftId" TEXT NOT NULL,
    "clockInAt" TIMESTAMP(3),
    "clockOutAt" TIMESTAMP(3),
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "isOvertimeShift" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "source" "AttendanceSource" NOT NULL DEFAULT 'KIOSK',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique constraint per (employee, date, shift)
CREATE UNIQUE INDEX "AttendanceRecord_employeeId_workDate_workShiftId_key" ON "AttendanceRecord"("employeeId", "workDate", "workShiftId");

-- CreateIndex: composite indexes
CREATE INDEX "AttendanceRecord_workDate_workShiftId_idx" ON "AttendanceRecord"("workDate", "workShiftId");
CREATE INDEX "AttendanceRecord_employeeId_workDate_idx" ON "AttendanceRecord"("employeeId", "workDate");

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_workShiftId_fkey" FOREIGN KEY ("workShiftId") REFERENCES "WorkShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
