/*
  Warnings:

  - The values [PPIC] on the enum `Role` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('ADMIN', 'WAREHOUSE', 'PRODUCTION', 'SALES', 'PLANNING', 'FINANCE', 'PROCUREMENT');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING (
  CASE
    WHEN "role"::text = 'PPIC' THEN 'PLANNING'::text::"Role_new"
    ELSE "role"::text::"Role_new"
  END
);
ALTER TABLE "RolePermission" ALTER COLUMN "role" TYPE "Role_new" USING (
  CASE
    WHEN "role"::text = 'PPIC' THEN 'PLANNING'::text::"Role_new"
    ELSE "role"::text::"Role_new"
  END
);
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'WAREHOUSE';
COMMIT;
