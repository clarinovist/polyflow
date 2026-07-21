import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { withTenantRoute } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { BpjsRecapService } from '@/services/hrd/bpjs-recap-service';
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

  const today = todayWibDateString();
  const year = parseInt(req.nextUrl.searchParams.get('year') || today.slice(0, 4), 10);
  const month = parseInt(req.nextUrl.searchParams.get('month') || today.slice(5, 7), 10);
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return new Response('Invalid year/month', { status: 400 });
  }

  const recap = await BpjsRecapService.getRecap(prisma, year, month);
  const header = [
    'Kode', 'Nama', 'Basis', 'Status', 'No Kes', 'No Ket',
    'Iuran Karyawan', 'Iuran Perusahaan', 'Potongan Real', 'Sumber',
  ];
  const lines = recap.rows.map((r) =>
    [
      r.employeeCode,
      r.employeeName,
      r.payType,
      r.status,
      r.bpjsKesehatanNo ?? '',
      r.bpjsKetenagakerjaanNo ?? '',
      r.employeeDeductionMaster,
      r.employerCostMaster,
      r.actualDeducted,
      r.source,
    ]
      .map(csvEscape)
      .join(','),
  );
  const body = '\uFEFF' + [header.join(','), ...lines].join('\n');
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="bpjs-${year}-${String(month).padStart(2, '0')}.csv"`,
    },
  });
});
