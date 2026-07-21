import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { withTenantRoute } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { LeaveService, leaveDayCount } from '@/services/hrd/disciplinary-leave-service';
import { todayWibDateString } from '@/services/hrd/shift-window';

function csvEscape(val: string | number): string {
  const s = String(val);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

export const GET = withTenantRoute(async (req: NextRequest) => {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const yearStr = req.nextUrl.searchParams.get('year');
  const monthStr = req.nextUrl.searchParams.get('month');
  const today = todayWibDateString();
  const year = parseInt(yearStr || today.slice(0, 4), 10);
  const month = parseInt(monthStr || today.slice(5, 7), 10);
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return new Response('Invalid year/month', { status: 400 });
  }

  const recap = await LeaveService.getRecap(prisma, year, month);
  const header = ['Kode', 'Nama', 'Jenis', 'Mulai', 'Selesai', 'Hari', 'Status', 'Alasan'];
  const lines = recap.rows.map((r) =>
    [
      r.employee.code,
      r.employee.name,
      r.type,
      r.startDate.toISOString().slice(0, 10),
      r.endDate.toISOString().slice(0, 10),
      leaveDayCount(r.startDate, r.endDate),
      r.status,
      r.reason ?? '',
    ]
      .map(csvEscape)
      .join(','),
  );
  const body = '\uFEFF' + [header.join(','), ...lines].join('\n');
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="cuti-${year}-${String(month).padStart(2, '0')}.csv"`,
    },
  });
});
