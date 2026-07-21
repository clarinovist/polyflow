import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { withTenantRoute } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { EmployeeLoanService } from '@/services/hrd/payroll-monthly-service';

function csvEscape(val: string | number): string {
  const s = String(val);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

export const GET = withTenantRoute(async (req: NextRequest) => {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const status = req.nextUrl.searchParams.get('status');
  const filters =
    status && status !== 'ALL'
      ? { status: status as 'ACTIVE' | 'PAID_OFF' | 'DEFAULTED' }
      : undefined;

  const rows = await EmployeeLoanService.list(prisma, filters);
  const header = [
    'No Kasbon', 'Kode', 'Nama', 'Tanggal', 'Pokok', 'Sisa', 'Tipe', 'Cicilan', 'Status', 'Alasan',
  ];
  const lines = rows.map((r) =>
    [
      r.loanNumber,
      r.employee.code,
      r.employee.name,
      r.date.toISOString().slice(0, 10),
      Number(r.principalAmount),
      Number(r.remainingBalance),
      r.repaymentType,
      r.installmentAmount != null ? Number(r.installmentAmount) : '',
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
      'Content-Disposition': 'attachment; filename="kasbon.csv"',
    },
  });
});
