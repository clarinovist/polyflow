import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { withTenantRoute } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { PayrollMonthlyService } from '@/services/hrd/payroll-monthly-service';
import { hasAnyRole } from '@/lib/auth/roles';

function csvEscape(val: string | number): string {
  const s = String(val);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

const toN = (v: number | { toNumber(): number } | null | undefined): number => {
  if (v == null) return 0;
  return typeof v === 'number' ? v : v.toNumber();
};

export const GET = withTenantRoute(async (req: NextRequest) => {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });
  if (!hasAnyRole(session.user, ['ADMIN', 'FINANCE'])) {
    return new Response('Forbidden', { status: 403 });
  }

  const periodId = req.nextUrl.searchParams.get('periodId');
  const yearStr = req.nextUrl.searchParams.get('year');
  const monthStr = req.nextUrl.searchParams.get('month');

  let period;
  if (periodId) {
    period = await prisma.payrollPeriod.findUnique({ where: { id: periodId } });
  } else if (yearStr && monthStr) {
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return new Response('Invalid year/month', { status: 400 });
    }
    period = await prisma.payrollPeriod.findFirst({ where: { year, month } });
  } else {
    return new Response('Missing periodId or year+month', { status: 400 });
  }

  if (!period) return new Response('Period not found', { status: 404 });

  const payslips = await PayrollMonthlyService.listPayslips(prisma, period.id);

  const header = [
    'Periode',
    'Kode',
    'Nama',
    'Status',
    'GajiPokok',
    'Tunjangan',
    'THR',
    'Gross',
    'BPJS',
    'Kasbon',
    'Prorata',
    'PotonganLain',
    'TotalPotongan',
    'NetPay',
    'Notes',
  ];

  const lines = payslips.map((p) => {
    const allowances = p.allowances.map((a) => `${a.name}: ${toN(a.amount)}`).join('; ');
    return [
      `${period.year}-${String(period.month).padStart(2, '0')}`,
      p.employee.code,
      p.employee.name,
      p.status,
      toN(p.baseSalary),
      allowances,
      toN(p.thrAmount),
      toN(p.grossPay),
      toN(p.bpjsDeduction),
      toN(p.loanDeduction),
      toN(p.prorationDeduction),
      toN(p.otherDeductions),
      toN(p.deductionTotal),
      toN(p.netPay),
      p.notes ?? '',
    ].map(csvEscape).join(',');
  });

  const csv = [header.join(','), ...lines].join('\n');
  const filename = `gaji-bulanan-${period.year}-${String(period.month).padStart(2, '0')}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
});
