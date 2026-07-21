import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { withTenantRoute } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { AttendanceService } from '@/services/hrd/attendance-service';
import { startOfWeek, endOfWeek } from '@/services/hrd/week-range';
import { todayWibDateString } from '@/services/hrd/shift-window';

function csvEscape(val: string | number): string {
  const s = String(val);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

type CsvRow = (string | number)[];
function csvResponse(filename: string, header: string[], lines: CsvRow[]) {
  const body = '\uFEFF' + [header.join(','), ...lines.map((r) => r.map(csvEscape).join(','))].join('\n');
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

export const GET = withTenantRoute(async (req: NextRequest) => {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const mode = req.nextUrl.searchParams.get('mode') || 'daily';
  const dateStr = req.nextUrl.searchParams.get('date') || todayWibDateString();

  if (mode === 'weekly') {
    const base = new Date(dateStr);
    const weekStart = startOfWeek(base);
    const weekEnd = endOfWeek(base);
    const rows = await AttendanceService.getWeeklySummary(prisma, weekStart, weekEnd);
    const header = [
      'Kode', 'Nama', 'Hadir', 'Jam Aktual', 'Jam OT',
      'Daily', 'OT Rp', 'Total',
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
    const year = parseInt(req.nextUrl.searchParams.get('year') || dateStr.slice(0, 4), 10);
    const month = parseInt(req.nextUrl.searchParams.get('month') || dateStr.slice(5, 7), 10);
    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return new Response('Invalid year/month', { status: 400 });
    }
    const rows = await AttendanceService.getMonthlySummary(prisma, year, month);
    const header = [
      'Kode', 'Nama', 'Hadir', 'Absent', 'Cuti', 'Multi-Shift', 'Jam Aktual', 'Jam OT',
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
    'Tanggal', 'Kode', 'Nama', 'Shift', 'Status', 'Masuk', 'Pulang',
    'Jam Rencana', 'Jam Aktual', 'Jam OT', 'Source',
  ];
  const lines = records.map((r) => [
    dateStr,
    r.employeeCode,
    r.employeeName,
    r.shiftName,
    r.status,
    r.clockInAt ? new Date(r.clockInAt).toISOString() : '',
    r.clockOutAt ? new Date(r.clockOutAt).toISOString() : '',
    r.plannedHours,
    r.actualHours ?? '',
    r.overtimeHours,
    r.source,
  ]);
  return csvResponse(`absensi-harian-${dateStr}.csv`, header, lines);
});
