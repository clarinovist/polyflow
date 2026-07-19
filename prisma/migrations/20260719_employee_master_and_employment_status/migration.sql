-- Fase 2: Data master karyawan + employment status (additive, all nullable)
-- Plan §10.2 + §13.2

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('PROBATION', 'PERMANENT', 'CONTRACT', 'RESIGNED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "MaritalStatus" AS ENUM ('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED');

-- AlterTable: Employee fields additive (all nullable)
ALTER TABLE "Employee" ADD COLUMN "employmentStatus" "EmploymentStatus" NOT NULL DEFAULT 'PROBATION';
ALTER TABLE "Employee" ADD COLUMN "joinDate" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN "probationEndDate" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN "contractEndDate" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN "nik" TEXT;
ALTER TABLE "Employee" ADD COLUMN "npwp" TEXT;
ALTER TABLE "Employee" ADD COLUMN "birthDate" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN "birthPlace" TEXT;
ALTER TABLE "Employee" ADD COLUMN "gender" "Gender";
ALTER TABLE "Employee" ADD COLUMN "maritalStatus" "MaritalStatus";
ALTER TABLE "Employee" ADD COLUMN "address" TEXT;
ALTER TABLE "Employee" ADD COLUMN "phone" TEXT;
ALTER TABLE "Employee" ADD COLUMN "photoUrl" TEXT;
ALTER TABLE "Employee" ADD COLUMN "bankName" TEXT;
ALTER TABLE "Employee" ADD COLUMN "bankAccountNo" TEXT;
ALTER TABLE "Employee" ADD COLUMN "bankAccountName" TEXT;
ALTER TABLE "Employee" ADD COLUMN "emergencyContactName" TEXT;
ALTER TABLE "Employee" ADD COLUMN "emergencyContactPhone" TEXT;
ALTER TABLE "Employee" ADD COLUMN "emergencyContactRelation" TEXT;
