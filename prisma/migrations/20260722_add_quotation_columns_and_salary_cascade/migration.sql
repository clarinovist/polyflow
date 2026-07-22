-- AlterTable
ALTER TABLE "SalesQuotation" ADD COLUMN "subject" TEXT,
ADD COLUMN "paymentTerms" TEXT,
ADD COLUMN "shippingTerms" TEXT,
ADD COLUMN "termsConditions" TEXT;

-- AlterTable
ALTER TABLE "EmployeeSalaryHistory" DROP CONSTRAINT "EmployeeSalaryHistory_employeeId_fkey",
ADD CONSTRAINT "EmployeeSalaryHistory_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON UPDATE CASCADE ON DELETE CASCADE;
