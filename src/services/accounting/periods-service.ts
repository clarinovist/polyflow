import { prisma } from "@/lib/core/prisma";
import { toBusinessDateString } from "@/lib/utils/timezone";

export async function getFiscalPeriods() {
  return await prisma.fiscalPeriod.findMany({
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
}

export async function createFiscalPeriod(year: number, month: number) {
  const name = new Date(year, month - 1).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  return await prisma.fiscalPeriod.create({
    data: {
      name,
      year,
      month,
      startDate,
      endDate,
      status: "OPEN",
    },
  });
}

export async function closeFiscalPeriod(id: string, userId: string) {
  // Generate Closing Journal Entries
  await generateClosingEntries(id, userId);

  return await prisma.fiscalPeriod.update({
    where: { id },
    data: {
      status: "CLOSED",
      closedById: userId,
      closedAt: new Date(),
    },
  });
}

import { Prisma } from "@prisma/client";

/**
 * Extract the calendar date in WIB (Asia/Jakarta, UTC+7) from a Date object.
 *
 * Problem: Dates serialized from the browser via Next.js server actions are
 * stored as UTC ISO strings. A user in WIB picking "July 1" gets serialized as
 * "2026-06-30T17:00:00.000Z" (June 30 in UTC). Using getFullYear/getMonth on
 * the server (UTC) gives the wrong calendar date.
 *
 * Fix: Use Intl.DateTimeFormat with Asia/Jakarta to extract the correct
 * calendar date regardless of server timezone.
 */
function getWibDateComponents(date: Date): { year: number; month: number } {
  const dateStr = toBusinessDateString(date); // "YYYY-MM-DD" in WIB
  const [year, month] = dateStr.split('-').map(Number);
  return { year, month };
}

export async function isPeriodOpen(
  date: Date,
  tx?: Prisma.TransactionClient,
): Promise<boolean> {
  const { year, month } = getWibDateComponents(date);
  const db = tx || prisma;

  const period = await db.fiscalPeriod.findUnique({
    where: { year_month: { year, month } },
  });

  // If no period exists for this date, deny access to enforce period setup
  if (!period) return false;

  return period.status === "OPEN";
}

import { createClosingJournalEntry } from "./journals-service";

/**
 * Generate Closing Entries for a Closed Period
 * - Thin wrapper that calls the core logic in journals-service
 */
export async function generateClosingEntries(
  periodId: string,
  userId: string,
): Promise<void> {
  await createClosingJournalEntry(periodId, userId);
}
