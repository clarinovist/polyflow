-- PeriodLock has been in schema.prisma since the HPP report shipped, but no
-- migration ever created its table, so locking a period failed on every
-- database. DDL taken verbatim from `prisma migrate diff --from-empty`.

-- CreateTable
CREATE TABLE "period_locks" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedById" TEXT,
    "notes" TEXT,

    CONSTRAINT "period_locks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "period_locks_year_month_key" ON "period_locks"("year", "month");

-- AddForeignKey
ALTER TABLE "period_locks" ADD CONSTRAINT "period_locks_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
