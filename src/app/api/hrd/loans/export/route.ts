import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { withTenantRoute } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { EmployeeLoanService } from '@/services/hrd/payroll-monthly-service';
import { requireModuleOrNextResponse } from '@/lib/modules/guard';
import { csvRow } from '@/lib/hrd/csv';
import { denyUnlessRoles, HRD_FINANCE_ROLES } from '@/lib/hrd/export-guard';

export const GET = withTenantRoute(async (req: NextRequest) => {
    const denied = await requireModuleOrNextResponse('HRD');
    if (denied) return denied;

    const session = await auth();
    if (!session?.user) return new Response('Unauthorized', { status: 401 });
    const forbidden = denyUnlessRoles(session.user, HRD_FINANCE_ROLES);
    if (forbidden) return forbidden;

    const status = req.nextUrl.searchParams.get('status');
    const filters =
        status && status !== 'ALL'
            ? { status: status as 'ACTIVE' | 'PAID_OFF' | 'DEFAULTED' }
            : undefined;

    const rows = await EmployeeLoanService.list(prisma, filters);
    const header = [
        'No Kasbon',
        'Kode',
        'Nama',
        'Tanggal',
        'Pokok',
        'Sisa',
        'Tipe',
        'Cicilan',
        'Status',
        'Alasan',
    ];
    const lines = rows.map((r) =>
        csvRow([
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
        ]),
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
