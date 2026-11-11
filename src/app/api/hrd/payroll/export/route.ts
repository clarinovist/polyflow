import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { withTenantRoute } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { PayrollService } from '@/services/hrd/payroll-service';
import { startOfWeek, endOfWeek } from '@/services/hrd/week-range';
import { requireModuleOrNextResponse } from '@/lib/modules/guard';
import { todayWibDateString } from '@/services/hrd/shift-window';
import { csvRow } from '@/lib/hrd/csv';
import { denyUnlessRoles, HRD_FINANCE_ROLES } from '@/lib/hrd/export-guard';

export const GET = withTenantRoute(async (req: NextRequest) => {
    const denied = await requireModuleOrNextResponse('HRD');
    if (denied) return denied;

    const session = await auth();
    if (!session?.user) return new Response('Unauthorized', { status: 401 });
    const forbidden = denyUnlessRoles(session.user, HRD_FINANCE_ROLES);
    if (forbidden) return forbidden;

    const dateStr = req.nextUrl.searchParams.get('date');
    const baseDate = dateStr
        ? new Date(dateStr)
        : new Date(`${todayWibDateString()}T00:00:00.000Z`);
    const weekStart = startOfWeek(baseDate);
    const weekEnd = endOfWeek(baseDate);

    const rows = await PayrollService.getWeeklyPayrollForAll(
        prisma,
        weekStart,
        weekEnd,
    );

    const header = [
        'Kode',
        'Nama',
        'Basis',
        'Hadir',
        'Jam',
        'Kg dibayar',
        'Kg exception',
        'Daily',
        'OT',
        'Piece',
        'Bruto',
        'BPJS',
        'Netto',
        'Minggu BPJS',
    ];
    const lines = rows.map((r) =>
        csvRow([
            r.employeeCode,
            r.employeeName,
            r.payType === 'PIECE'
                ? 'Borongan'
                : r.payType === 'MONTHLY'
                  ? 'Bulanan'
                  : 'Harian',
            r.daysWorked,
            r.totalActualHours,
            r.totalKgPaid,
            r.totalKgUnpaid,
            r.totalDailyEarnings,
            r.totalOvertimeEarnings,
            r.totalPieceEarnings,
            r.totalEarnings,
            r.bpjsDeduction,
            r.netPay,
            r.isBpjsWeek ? 'Ya' : 'Tidak',
        ]),
    );
    const csv = [header.join(','), ...lines].join('\n');

    const slug = weekStart.toISOString().slice(0, 10);
    return new Response(csv, {
        status: 200,
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="gaji-${slug}.csv"`,
        },
    });
});
