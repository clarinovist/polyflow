/*
  Warnings:

  - You are about to drop the column `contactId` on the `SupplierProduct` table. All the data in the column will be lost.
  - You are about to drop the `Contact` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "SupplierProduct" DROP CONSTRAINT "SupplierProduct_contactId_fkey";

-- AlterTable
ALTER TABLE "SupplierProduct" DROP COLUMN "contactId";

-- DropTable
DROP TABLE "Contact";

-- DropEnum
DROP TYPE "ContactType";
