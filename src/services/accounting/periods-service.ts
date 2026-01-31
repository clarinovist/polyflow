import { prisma } from '@/lib/prisma';

export async function getFiscalPeriods() {
    return await prisma.fiscalPeriod.findMany({
        orderBy: [{ year: 'desc' }, { month: 'desc' }]
    });
}

export async function createFiscalPeriod(year: number, month: number) {
    const name = new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    return await prisma.fiscalPeriod.create({
        data: {
            name,
            year,
            month,
            startDate,
            endDate,
            status: 'OPEN'
        }
    });
}

export async function closeFiscalPeriod(id: string, userId: string) {
    return await prisma.fiscalPeriod.update({
        where: { id },
        data: {
            status: 'CLOSED',
            closedById: userId,
            closedAt: new Date()
        }
    });
}

export async function isPeriodOpen(date: Date): Promise<boolean> {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;

    const period = await prisma.fiscalPeriod.findUnique({
        where: { year_month: { year, month } }
    });

    if (!period) return true;

    return period.status === 'OPEN';
}
