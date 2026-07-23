-- AlterEnum: Add HRD to Role enum
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'HRD';
