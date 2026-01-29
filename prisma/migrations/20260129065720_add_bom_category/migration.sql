-- CreateEnum
CREATE TYPE "BomCategory" AS ENUM ('STANDARD', 'MIXING', 'EXTRUSION', 'PACKING');

-- AlterTable
ALTER TABLE "Bom" ADD COLUMN     "category" "BomCategory" NOT NULL DEFAULT 'STANDARD';
