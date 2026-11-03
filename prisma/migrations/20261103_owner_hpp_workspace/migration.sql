-- Private scratch workspace for the owner HPP calculator. Additive only: one new
-- table, no change to existing tables. DDL from `prisma migrate diff`.

-- CreateTable
CREATE TABLE "owner_hpp_workspaces" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "document" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_hpp_workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "owner_hpp_workspaces_userId_key" ON "owner_hpp_workspaces"("userId");

-- AddForeignKey
ALTER TABLE "owner_hpp_workspaces" ADD CONSTRAINT "owner_hpp_workspaces_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
