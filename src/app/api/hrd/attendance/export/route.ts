import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { withTenantRoute } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { AttendanceService } from '@/services/hrd/attendance-service';
import { startOfWeek, endOfWeek } from '@/services/hrd/week-range';
import { todayWibDateString } from '@/services/hrd/shift-window';
import { formatWIB } from '@/lib/utils/timezone';
import { requireModuleOrNextResponse } from '@/lib/modules/guard';
import { csvRow } from '@/lib/hrd/csv';
import { denyUnlessRoles, HRD_FINANCE_ROLES } from '@/lib/hrd/export-guard';

type CsvRow = (string | number)[];
function csvResponse(filename: string, header: string[], lines: CsvRow[]) {
    const body =
        '\uFEFF' +
        [header.join(','), ...lines.map((r) => csvRow(r))].join('\n');
    return new Response(body, {
        status: 200,
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${filename}"`,
        },
    });
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const YEAR_PATTERN = /^\d{4}$/;
const MONTH_PATTERN = /^\d{1,2}$/;
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;
const MAX_MONTH = 12;
const INVALID_PARAMS_MESSAGE = 'Invalid date/year/month';
const BAD_REQUEST_STATUS = 400;

function invalidParams(): Response {
    return new Response(INVALID_PARAMS_MESSAGE, { status: BAD_REQUEST_STATUS });
}

/** Strict YYYY-MM-DD that also round-trips as a real calendar date. */
function isValidDateString(value: string): boolean {
    if (!DATE_PATTERN.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
        !Number.isNaN(parsed.getTime()) &&
        parsed.toISOString().slice(0, 10) === value
    );
}

function parseYear(value: string): number | null {
    if (!YEAR_PATTERN.test(value)) return null;
    const year = Number(value);
    return year >= MIN_YEAR && year <= MAX_YEAR ? year : null;
}

function parseMonth(value: string): number | null {
    if (!MONTH_PATTERN.test(value)) return null;
    const month = Number(value);
    return month >= 1 && month <= MAX_MONTH ? month : null;
}

export const GET = withTenantRoute(async (req: NextRequest) => {
    // ── Module entitlement guard ──
    const denied = await requireModuleOrNextResponse('HRD');
    if (denied) return denied;

    const session = await auth();
    if (!session?.user) return new Response('Unauthorized', { status: 401 });
    const forbidden = denyUnlessRoles(session.user, HRD_FINANCE_ROLES);
    if (forbidden) return forbidden;

    const mode = req.nextUrl.searchParams.get('mode') || 'daily';
    const dateStr =
        req.nextUrl.searchParams.get('date') || todayWibDateString();
    if (!isValidDateString(dateStr)) return invalidParams();

    if (mode === 'weekly') {
        const base = new Date(dateStr);
        const weekStart = startOfWeek(base);
        const weekEnd = endOfWeek(base);
        const rows = await AttendanceService.getWeeklySummary(
            prisma,
            weekStart,
            weekEnd,
        );
        const header = [
            'Kode',
            'Nama',
            'Hadir',
            'Jam Aktual',
            'Jam OT',
            'Daily',
            'OT Rp',
            'Total',
        ];
        const lines = rows.map((r) => [
            r.employeeCode,
            r.employeeName,
            r.daysPresent,
            r.totalActualHours,
            r.totalOvertimeHours,
            r.totalDailyEarnings,
            r.totalOvertimeEarnings,
            r.totalEarnings,
        ]);
        const slug = weekStart.toISOString().slice(0, 10);
        return csvResponse(`absensi-mingguan-${slug}.csv`, header, lines);
    }

    if (mode === 'monthly') {
        const year = parseYear(
            req.nextUrl.searchParams.get('year') || dateStr.slice(0, 4),
        );
        const month = parseMonth(
            req.nextUrl.searchParams.get('month') || dateStr.slice(5, 7),
        );
        if (year === null || month === null) return invalidParams();
        const rows = await AttendanceService.getMonthlySummary(
            prisma,
            year,
            month,
        );
        const header = [
            'Kode',
            'Nama',
            'Hadir',
            'Absent',
            'Cuti',
            'Multi-Shift',
            'Jam Aktual',
            'Jam OT',
        ];
        const lines = rows.map((r) => [
            r.employeeCode,
            r.employeeName,
            r.daysPresent,
            r.daysAbsent,
            r.daysOnLeave,
            r.multiShiftDays,
            r.totalActualHours,
            r.totalOvertimeHours,
        ]);
        return csvResponse(
            `absensi-bulanan-${year}-${String(month).padStart(2, '0')}.csv`,
            header,
            lines,
        );
    }

    // daily
    const shift = req.nextUrl.searchParams.get('shift') || undefined;
    const ot = req.nextUrl.searchParams.get('ot') === '1';
    const workDate = new Date(dateStr);
    const records = await AttendanceService.listByDate(prisma, workDate, {
        workShiftId: shift,
        overtimeOnly: ot,
    });
    const header = [
        'Tanggal',
        'Kode',
        'Nama',
        'Shift',
        'Status',
        'Masuk',
        'Pulang',
        'Jam Rencana',
        'Jam Aktual',
        'Jam OT',
        'Source',
    ];
    const lines = records.map((r) => [
        dateStr,
        r.employeeCode,
        r.employeeName,
        r.shiftName,
        r.status,
        r.clockInAt ? formatWIB(r.clockInAt, 'HH:mm') : '',
        r.clockOutAt ? formatWIB(r.clockOutAt, 'HH:mm') : '',
        r.plannedHours,
        r.actualHours ?? '',
        r.overtimeHours,
        r.source,
    ]);
    return csvResponse(`absensi-harian-${dateStr}.csv`, header, lines);
});
