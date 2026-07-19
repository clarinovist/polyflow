-- Fase 5: Monthly payroll + BPJS + Kasbon (§3)
-- All additive; EmployeePayType gains a new value MONTHLY (no constraint drop needed).

-- CreateEnum
CREATE TYPE "LoanRepaymentType" AS ENUM ('INSTALLMENT', 'FULL_NEXT_MONTH');
CREATE TYPE "LoanStatus" AS ENUM ('ACTIVE', 'PAID_OFF', 'DEFAULTED');
CREATE TYPE "PayslipStatus" AS ENUM ('DRAFT', 'FINALIZED', 'PAID');
CREATE TYPE "PayrollPeriodStatus" AS ENUM ('OPEN', 'CLOSED');

-- AlterTable: Employee — monthly payroll + BPJS fields (all nullable except bpjsParticipant default)
ALTER TABLE "Employee" ADD COLUMN "monthlySalary" DECIMAL(12,2);
ALTER TABLE "Employee" ADD COLUMN "bpjsParticipant" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Employee" ADD COLUMN "bpjsEmployeeDeduction" DECIMAL(12,2);
ALTER TABLE "Employee" ADD COLUMN "bpjsEmployerCost" DECIMAL(12,2);
ALTER TABLE "Employee" ADD COLUMN "bpjsKesehatanNo" TEXT;
ALTER TABLE "Employee" ADD COLUMN "bpjsKetenagakerjaanNo" TEXT;

-- AlterEnum: extend EmployeePayType with MONTHLY (additive, safe-ish with older Postgres)
-- Use a separate ALTER TYPE since Prisma doesn't enum-extend inline.
ALTER TYPE "EmployeePayType" ADD VALUE IF NOT EXISTS 'MONTHLY';

-- CreateTable: EmployeeAllowance
CREATE TABLE "EmployeeAllowance" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeAllowance_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmployeeAllowance_employeeId_idx" ON "EmployeeAllowance"("employeeId");

-- CreateTable: EmployeeLoan
CREATE TABLE "EmployeeLoan" (
    "id" TEXT NOT NULL,
    "loanNumber" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "principalAmount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT,
    "repaymentType" "LoanRepaymentType" NOT NULL,
    "installmentAmount" DECIMAL(12,2),
    "remainingBalance" DECIMAL(12,2) NOT NULL,
    "status" "LoanStatus" NOT NULL DEFAULT 'ACTIVE',
    "collateralDescription" TEXT,
    "collateralPhotoUrl" TEXT,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeLoan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmployeeLoan_loanNumber_key" ON "EmployeeLoan"("loanNumber");
CREATE INDEX "EmployeeLoan_employeeId_idx" ON "EmployeeLoan"("employeeId");
CREATE INDEX "EmployeeLoan_status_idx" ON "EmployeeLoan"("status");

-- Partial unique index: at most ONE ACTIVE loan per employee.
CREATE UNIQUE INDEX "one_active_loan_per_employee"
    ON "EmployeeLoan" ("employeeId")
    WHERE status = 'ACTIVE';

-- CreateTable: EmployeeLoanPayment
CREATE TABLE "EmployeeLoanPayment" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "payslipId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "EmployeeLoanPayment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmployeeLoanPayment_loanId_idx" ON "EmployeeLoanPayment"("loanId");
CREATE INDEX "EmployeeLoanPayment_payslipId_idx" ON "EmployeeLoanPayment"("payslipId");

-- CreateTable: PayrollPeriod
CREATE TABLE "PayrollPeriod" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "PayrollPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollPeriod_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PayrollPeriod_year_month_key" ON "PayrollPeriod"("year", "month");

-- CreateTable: Payslip
CREATE TABLE "Payslip" (
    "id" TEXT NOT NULL,
    "payrollPeriodId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "baseSalary" DECIMAL(12,2) NOT NULL,
    "allowanceTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "thrAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "prorationDeduction" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "grossPay" DECIMAL(12,2) NOT NULL,
    "bpjsDeduction" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "loanDeduction" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "otherDeductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deductionTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netPay" DECIMAL(12,2) NOT NULL,
    "status" "PayslipStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payslip_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Payslip_payrollPeriodId_employeeId_key" ON "Payslip"("payrollPeriodId", "employeeId");
CREATE INDEX "Payslip_employeeId_idx" ON "Payslip"("employeeId");

-- CreateTable: PayslipAllowance
CREATE TABLE "PayslipAllowance" (
    "id" TEXT NOT NULL,
    "payslipId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "PayslipAllowance_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PayslipAllowance_payslipId_idx" ON "PayslipAllowance"("payslipId");

-- AddForeignKey
ALTER TABLE "EmployeeAllowance" ADD CONSTRAINT "EmployeeAllowance_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmployeeLoan" ADD CONSTRAINT "EmployeeLoan_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeLoan" ADD CONSTRAINT "EmployeeLoan_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmployeeLoanPayment" ADD CONSTRAINT "EmployeeLoanPayment_loanId_fkey"
    FOREIGN KEY ("loanId") REFERENCES "EmployeeLoan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeLoanPayment" ADD CONSTRAINT "EmployeeLoanPayment_payslipId_fkey"
    FOREIGN KEY ("payslipId") REFERENCES "Payslip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_closedById_fkey"
    FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_payrollPeriodId_fkey"
    FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PayslipAllowance" ADD CONSTRAINT "PayslipAllowance_payslipId_fkey"
    FOREIGN KEY ("payslipId") REFERENCES "Payslip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
