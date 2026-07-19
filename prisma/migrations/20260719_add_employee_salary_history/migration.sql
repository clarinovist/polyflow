-- CreateTable
CREATE TABLE "EmployeeSalaryHistory" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedById" TEXT,
    "payType" TEXT,
    "dailyRate" DECIMAL(12,2),
    "monthlySalary" DECIMAL(12,2),
    "overtimeHourlyRate" DECIMAL(12,2),
    "standardDayHours" DECIMAL(4,2),
    "bpjsParticipant" BOOLEAN,
    "bpjsEmployeeDeduction" DECIMAL(12,2),
    "bpjsEmployerCost" DECIMAL(12,2),
    "changes" JSONB,

    CONSTRAINT "EmployeeSalaryHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeSalaryHistory_employeeId_changedAt_idx" ON "EmployeeSalaryHistory"("employeeId", "changedAt");

-- AddForeignKey
ALTER TABLE "EmployeeSalaryHistory" ADD CONSTRAINT "EmployeeSalaryHistory_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSalaryHistory" ADD CONSTRAINT "EmployeeSalaryHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
