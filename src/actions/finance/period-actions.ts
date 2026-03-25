'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from '@/lib/core/prisma';
import { PeriodStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { createClosingJournalEntry } from '@/services/accounting/journals-service';
import { getIncomeStatement } from '@/services/accounting/reports-service';

export const getFiscalPeriods = withTenant(
async function getFiscalPeriods(year?: number) {
    const currentYear = year || new Date().getFullYear();

    return await prisma.fiscalPeriod.findMany({
        where: { year: currentYear },
        orderBy: { month: 'asc' }
    });
}
);

export const getIncomeStatementSummary = withTenant(
async function getIncomeStatementSummary(id: string) {
    const period = await prisma.fiscalPeriod.findUnique({ where: { id } });
    if (!period) throw new Error("Period not found");

    const report = await getIncomeStatement(period.startDate, period.endDate);
    return {
        totalRevenue: report.totalRevenue,
        totalOpEx: report.totalOpEx,
        netIncome: report.netIncome,
        periodName: period.name
    };
}
);

export const generatePeriodsForYear = withTenant(
async function generatePeriodsForYear(year: number) {
    // Check if periods exist
    const existing = await prisma.fiscalPeriod.count({ where: { year } });
    if (existing > 0) throw new Error(`Periods for ${year} already exist.`);

    const periods = [];
    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
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
            status: PeriodStatus.OPEN
        });
    }

    await prisma.fiscalPeriod.createMany({ data: periods });
    revalidatePath('/finance/periods');
    return { success: true };
}
);

export const closePeriod = withTenant(
async function closePeriod(id: string, userId: string) {
    await prisma.$transaction(async (tx) => {
        // 1. Generate Closing Journal Entry
        await createClosingJournalEntry(id, userId, tx);

        // 2. Mark period as CLOSED
        await tx.fiscalPeriod.update({
            where: { id },
            data: {
                status: PeriodStatus.CLOSED,
                closedById: userId,
                closedAt: new Date()
            }
        });
    });

    revalidatePath('/finance/periods');
}
);

export const reopenPeriod = withTenant(
async function reopenPeriod(id: string) {
    await prisma.fiscalPeriod.update({
        where: { id },
        data: {
            status: PeriodStatus.OPEN,
            closedById: null,
            closedAt: null
        }
    });
    revalidatePath('/finance/periods');
}
);
