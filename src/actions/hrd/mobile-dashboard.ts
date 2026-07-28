'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { safeAction } from '@/lib/errors/errors';
import { requireAuth } from '@/lib/tools/auth-checks';
import { serializeData } from '@/lib/utils/utils';

export interface MobileHrdOverview {
    generatedAt: string;
    highlights: {
        presentTodayCount: number;
        pendingLeaveCount: number;
        attendanceAlertsCount: number;
        absentYesterdayCount: number;
        openPayrollPeriodName?: string;
    };
    pendingLeaves: Array<{
        id: string;
        employeeName: string;
        leaveType: string;
        startDate: string;
        endDate: string;
        status: string;
    }>;
}

export const getHrdMobileOverview = withTenant(
    async function getHrdMobileOverview() {
        return safeAction(async () => {
            await requireAuth();

            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);

            const [presentToday, pendingLeaves, openPeriod] = await Promise.all([
                prisma.attendanceRecord
                    ? prisma.attendanceRecord.count({
                          where: { workDate: { gte: todayStart } },
                      }).catch(() => 0)
                    : Promise.resolve(0),
                prisma.leaveRequest
                    ? prisma.leaveRequest.findMany({
                          where: { status: 'PENDING' },
                          take: 10,
                          orderBy: { createdAt: 'desc' },
                          include: { employee: { select: { name: true } } },
                      }).catch(() => [])
                    : Promise.resolve([]),
                prisma.payrollPeriod
                    ? prisma.payrollPeriod.findFirst({
                          where: { status: 'OPEN' },
                          select: { month: true, year: true },
                      }).catch(() => null)
                    : Promise.resolve(null),
            ]);

            const periodName = openPeriod
                ? `Periode ${openPeriod.month}/${openPeriod.year}`
                : undefined;

            const overview: MobileHrdOverview = {
                generatedAt: new Date().toISOString(),
                highlights: {
                    presentTodayCount: presentToday,
                    pendingLeaveCount: pendingLeaves.length,
                    attendanceAlertsCount: 0,
                    absentYesterdayCount: 0,
                    openPayrollPeriodName: periodName,
                },
                pendingLeaves: pendingLeaves.map((l: { id: string; employee?: { name: string } | null; leaveType?: string | null; startDate: Date | null; endDate: Date | null; status: string }) => ({
                    id: l.id,
                    employeeName: l.employee?.name ?? 'Karyawan',
                    leaveType: l.leaveType || 'Cuti',
                    startDate: l.startDate
                        ? new Date(l.startDate).toISOString()
                        : todayStart.toISOString(),
                    endDate: l.endDate
                        ? new Date(l.endDate).toISOString()
                        : todayStart.toISOString(),
                    status: l.status,
                })),
            };

            return serializeData(overview);
        });
    },
);
