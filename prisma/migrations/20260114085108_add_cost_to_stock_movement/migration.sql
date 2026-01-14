-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'PPIC';

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "cost" DECIMAL(15,4);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "resource" TEXT NOT NULL,
    "canAccess" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_role_resource_key" ON "RolePermission"("role", "resource");
