import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { withTenantRoute } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { DisciplinaryService } from '@/services/hrd/disciplinary-leave-service';
import { requireModuleOrNextResponse } from '@/lib/modules/guard';
import { csvRow } from '@/lib/hrd/csv';
import { denyUnlessRoles, HRD_APPROVER_ROLES } from '@/lib/hrd/export-guard';

export const GET = withTenantRoute(async (req: NextRequest) => {
    const denied = await requireModuleOrNextResponse('HRD');
    if (denied) return denied;

    const session = await auth();
    if (!session?.user) return new Response('Unauthorized', { status: 401 });
    const forbidden = denyUnlessRoles(session.user, HRD_APPROVER_ROLES);
    if (forbidden) return forbidden;

    const yearStr = req.nextUrl.searchParams.get('year');
    const monthStr = req.nextUrl.searchParams.get('month');
    let rows = await DisciplinaryService.list(prisma);

    if (yearStr && monthStr) {
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10);
        if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
            const monthStart = new Date(Date.UTC(year, month - 1, 1));
            const monthEnd = new Date(
                Date.UTC(year, month, 0, 23, 59, 59, 999),
            );
            rows = rows.filter(
                (r) =>
                    r.effectiveDate >= monthStart &&
                    r.effectiveDate <= monthEnd,
            );
        }
    }

    const now = new Date();
    const header = [
        'Kode',
        'Nama',
        'Jenis',
        'Berlaku',
        'Hangus',
        'Status',
        'Alasan',
    ];
    const lines = rows.map((r) => {
        const active = !r.expiryDate || r.expiryDate >= now;
        return csvRow([
            r.employee.code,
            r.employee.name,
            r.type,
            r.effectiveDate.toISOString().slice(0, 10),
            r.expiryDate ? r.expiryDate.toISOString().slice(0, 10) : '',
            active ? 'Aktif' : 'Hangus',
            r.reason,
        ]);
    });
    const body = '\uFEFF' + [header.join(','), ...lines].join('\n');
    return new Response(body, {
        status: 200,
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="disiplin.csv"',
        },
    });
});
