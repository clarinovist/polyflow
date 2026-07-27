-- CreateEnum
CREATE TYPE "HelpMessageRole" AS ENUM ('USER', 'ASSISTANT');

-- AlterTable: convert role column from TEXT to enum
ALTER TABLE "HelpMessage" ALTER COLUMN "role" TYPE "HelpMessageRole"
  USING ("role"::"HelpMessageRole");
