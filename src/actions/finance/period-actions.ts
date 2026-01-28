'use server';

import { prisma } from '@/lib/prisma';
import { PeriodStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';

export async function getFiscalPeriods(year?: number) {
    const currentYear = year || new Date().getFullYear();

    return await prisma.fiscalPeriod.findMany({
        where: { year: currentYear },
        orderBy: { month: 'asc' }
    });
}

export async function generatePeriodsForYear(year: number) {
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

export async function closePeriod(id: string, userId: string) {
    // Validate if previous period is closed? Optional.
    await prisma.fiscalPeriod.update({
        where: { id },
        data: {
            status: PeriodStatus.CLOSED,
            closedById: userId,
            closedAt: new Date()
        }
    });
    revalidatePath('/finance/periods');
}

export async function reopenPeriod(id: string) {
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
