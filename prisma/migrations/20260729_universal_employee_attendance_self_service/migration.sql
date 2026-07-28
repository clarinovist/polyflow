-- AlterEnum
ALTER TYPE "AttendanceSource" ADD VALUE IF NOT EXISTS 'SELF_SERVICE';

-- AlterTable: add geo evidence fields to AttendanceRecord
ALTER TABLE "AttendanceRecord"
  ADD COLUMN "clockInLatitude"   DECIMAL(9,6),
  ADD COLUMN "clockInLongitude"  DECIMAL(9,6),
  ADD COLUMN "clockInAccuracy"   DECIMAL(8,2),
  ADD COLUMN "clockInDistance"    DECIMAL(10,2),
  ADD COLUMN "clockOutLatitude"  DECIMAL(9,6),
  ADD COLUMN "clockOutLongitude" DECIMAL(9,6),
  ADD COLUMN "clockOutAccuracy"  DECIMAL(8,2),
  ADD COLUMN "clockOutDistance"   DECIMAL(10,2);

-- CreateTable
CREATE TABLE "EmployeeShiftAssignment" (
    "id"            TEXT NOT NULL,
    "employeeId"    TEXT NOT NULL,
    "workShiftId"   TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo"   DATE,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeShiftAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeShiftAssignment_employeeId_effectiveFrom_effectiveTo_idx" ON "EmployeeShiftAssignment"("employeeId", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "EmployeeShiftAssignment_employeeId_workShiftId_idx" ON "EmployeeShiftAssignment"("employeeId", "workShiftId");

-- AddForeignKey
ALTER TABLE "EmployeeShiftAssignment" ADD CONSTRAINT "EmployeeShiftAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeShiftAssignment" ADD CONSTRAINT "EmployeeShiftAssignment_workShiftId_fkey" FOREIGN KEY ("workShiftId") REFERENCES "WorkShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
