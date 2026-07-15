"use server";

import { withTenant } from "@/lib/core/tenant";
import { prisma } from "@/lib/core/prisma";
import { PeriodStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { createClosingJournalEntry } from "@/services/accounting/journals-service";
import { getIncomeStatement } from "@/services/accounting/reports-service";
import {
  safeAction,
  NotFoundError,
  BusinessRuleError,
} from "@/lib/errors/errors";
import { hasAnyRole } from "@/lib/auth/roles";

export const getFiscalPeriods = withTenant(async function getFiscalPeriods(
  year?: number,
) {
  return safeAction(async () => {
    const currentYear = year || new Date().getFullYear();

    return await prisma.fiscalPeriod.findMany({
      where: { year: currentYear },
      orderBy: { month: "asc" },
    });
  });
});

export const getIncomeStatementSummary = withTenant(
  async function getIncomeStatementSummary(id: string) {
    return safeAction(async () => {
      const period = await prisma.fiscalPeriod.findUnique({ where: { id } });
      if (!period) throw new NotFoundError("Fiscal Period", id);

      const report = await getIncomeStatement(period.startDate, period.endDate);
      return {
        totalRevenue: report.totalRevenue,
        totalOpEx: report.totalOpEx,
        netIncome: report.netIncome,
        periodName: period.name,
      };
    });
  },
);

export const generatePeriodsForYear = withTenant(
  async function generatePeriodsForYear(year: number) {
    return safeAction(async () => {
      // Check if periods exist
      const existing = await prisma.fiscalPeriod.count({ where: { year } });
      if (existing > 0)
        throw new BusinessRuleError(`Periods for ${year} already exist.`);

      const periods = [];
      const months = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ];

      for (let i = 0; i < 12; i++) {
        const startDate = new Date(year, i, 1);
        const endDate = new Date(year, i + 1, 0); // Last day of month

        periods.push({
          name: `${months[i]} ${year}`,
          startDate,
          endDate,
          year,
          month: i + 1,
          status: PeriodStatus.OPEN,
        });
      }

      await prisma.fiscalPeriod.createMany({ data: periods });
      revalidatePath("/finance/periods");
      return { message: `Periods for ${year} generated successfully` };
    });
  },
);

export const closePeriod = withTenant(async function closePeriod(id: string) {
  return safeAction(async () => {
    const { requireAuth } = await import("@/lib/tools/auth-checks");
    const { logActivity } = await import("@/lib/tools/audit");

    const session = await requireAuth();
    if (!hasAnyRole(session.user, ["ADMIN", "FINANCE"])) {
      throw new BusinessRuleError(
        "Only ADMIN or FINANCE roles can close fiscal periods",
      );
    }

    const period = await prisma.fiscalPeriod.findUnique({ where: { id } });
    if (!period) throw new NotFoundError("Fiscal Period", id);
    if (period.status !== PeriodStatus.OPEN) {
      throw new BusinessRuleError("Only OPEN periods can be closed");
    }

    const userId = session.user.id;
    await prisma.$transaction(async (tx) => {
      // 1. Generate Closing Journal Entry
      await createClosingJournalEntry(id, userId, tx);

      // 2. Mark period as CLOSED
      await tx.fiscalPeriod.update({
        where: { id },
        data: {
          status: PeriodStatus.CLOSED,
          closedById: userId,
          closedAt: new Date(),
        },
      });
    });

    await logActivity({
      userId,
      action: "CLOSE_FISCAL_PERIOD",
      entityType: "FiscalPeriod",
      entityId: id,
      details: `Closed fiscal period ${period.name}`,
    });

    revalidatePath("/finance/periods");
    return { message: "Period closed successfully" };
  });
});

export const reopenPeriod = withTenant(async function reopenPeriod(id: string) {
  return safeAction(async () => {
    const { requireAuth } = await import("@/lib/tools/auth-checks");
    const { logActivity } = await import("@/lib/tools/audit");

    const session = await requireAuth();
    if (!hasAnyRole(session.user, ["ADMIN", "FINANCE"])) {
      throw new BusinessRuleError(
        "Only ADMIN or FINANCE roles can reopen fiscal periods",
      );
    }

    const period = await prisma.fiscalPeriod.findUnique({ where: { id } });
    if (!period) throw new NotFoundError("Fiscal Period", id);
    if (period.status === PeriodStatus.LOCKED) {
      throw new BusinessRuleError("Cannot reopen a LOCKED fiscal period");
    }

    // Wrap in transaction to ensure atomicity of journal deletion + period update
    await prisma.$transaction(async (tx) => {
      // Delete the closing journal entry for this period before reopening
      const closingReference = `CLOSING-${period.name.replace(/\s+/g, "-")}`;
      const closingEntry = await tx.journalEntry.findFirst({
        where: { reference: closingReference },
      });

      if (closingEntry) {
        await tx.journalLine.deleteMany({
          where: { journalEntryId: closingEntry.id },
        });
        await tx.journalEntry.delete({
          where: { id: closingEntry.id },
        });
      }

      await tx.fiscalPeriod.update({
        where: { id },
        data: {
          status: PeriodStatus.OPEN,
          closedById: null,
          closedAt: null,
        },
      });
    });

    await logActivity({
      userId: session.user.id,
      action: "REOPEN_FISCAL_PERIOD",
      entityType: "FiscalPeriod",
      entityId: id,
      details: `Reopened fiscal period ${period.name}`,
    });

    revalidatePath("/finance/periods");
    return { message: "Period reopened successfully" };
  });
});
