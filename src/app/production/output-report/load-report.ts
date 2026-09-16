import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/core/prisma';
import { withTenantPage } from '@/lib/core/tenant';
import {
    canAccessWorkspace,
    hasWorkspaceEntitlement,
    isPathAllowedByResources,
} from '@/lib/auth/access-policy';
import {
    OUTPUT_REPORT_PATH,
    parseOutputReportFilter,
    type ReportSearchParams,
} from '@/lib/production/output-report';
import { ProductionOutputReportService } from '@/services/production/production-output-report-service';

/** Read-only fresh permissions: deliberately does not call getMyPermissions (which can seed roles). */
export const loadOutputReport = withTenantPage(
    async (params: ReportSearchParams) => {
        const session = await auth();
        if (!session?.user?.id) redirect('/login');
        if (session.user.isSuperAdmin) redirect('/dashboard');
        if (!hasWorkspaceEntitlement('production'))
            redirect('/error?error=ModuleNotEntitled');
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { role: true, isActive: true, isSuperAdmin: true },
        });
        if (!user?.isActive || user.isSuperAdmin) redirect('/dashboard');
        const assignments = await prisma.userRole.findMany({
            where: { userId: session.user.id },
            select: { role: true },
        });
        const roles = [
            ...new Set([user.role, ...assignments.map((r) => r.role)]),
        ];
        const resources: string[] | 'ALL' = roles.includes('ADMIN')
            ? 'ALL'
            : (
                  await prisma.rolePermission.findMany({
                      where: { role: { in: roles }, canAccess: true },
                      select: { resource: true },
                  })
              ).map((p) => p.resource);
        if (
            !canAccessWorkspace(
                {
                    ...user,
                    roles,
                    allowedResources: resources === 'ALL' ? [] : resources,
                },
                'production',
                OUTPUT_REPORT_PATH,
            ) ||
            !isPathAllowedByResources(OUTPUT_REPORT_PATH, resources)
        ) {
            redirect('/dashboard');
        }
        const filter = parseOutputReportFilter(params);
        const report = await ProductionOutputReportService.getReport(filter);
        return {
            report,
            canViewOrders: isPathAllowedByResources(
                '/production/orders',
                resources,
            ),
        };
    },
);
