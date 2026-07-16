import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { withTenantRoute } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { PayrollService } from '@/services/hrd/payroll-service';
import { startOfWeek, endOfWeek } from '@/services/hrd/week-range';

function csvEscape(val: string | number): string {
  const s = String(val);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

export const GET = withTenantRoute(async (req: NextRequest) => {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const dateStr = req.nextUrl.searchParams.get('date');
  const baseDate = dateStr ? new Date(dateStr) : new Date();
  const weekStart = startOfWeek(baseDate);
  const weekEnd = endOfWeek(baseDate);

  const rows = await PayrollService.getWeeklyPayrollForAll(prisma, weekStart, weekEnd);

  const header = [
    'Kode', 'Nama', 'Basis', 'Hadir', 'Jam', 'Kg dibayar', 'Kg exception',
    'Daily', 'OT', 'Piece', 'Total',
  ];
  const lines = rows.map((r) =>
    [
      r.employeeCode,
      r.employeeName,
      r.payType === 'PIECE' ? 'Borongan' : 'Harian',
      r.daysWorked,
      r.totalActualHours,
      r.totalKgPaid,
      r.totalKgUnpaid,
      r.totalDailyEarnings,
      r.totalOvertimeEarnings,
      r.totalPieceEarnings,
      r.totalEarnings,
    ].map(csvEscape).join(',')
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
