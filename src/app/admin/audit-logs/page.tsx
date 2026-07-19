import { getCrossTenantAuditLogs, getCrossTenantAuditLogStats } from '@/actions/admin/cross-tenant-audit';
import AuditLogClient from './AuditLogClient';

export const metadata = {
    title: 'Audit Logs | PolyFlow Admin',
    description: 'System audit and security trails across all tenants + platform',
};

interface SearchParams {
    page?: string;
    tenantId?: string;
    entityType?: string;
    action?: string;
}

export default async function AuditLogsPage({
    searchParams
}: {
    searchParams: SearchParams
}) {
    const page = searchParams.page ? parseInt(searchParams.page, 10) : 1;
    const limit = 50;

    // Superadmin view: merge platform (main DB) + every tenant DB.
    const initialData = await getCrossTenantAuditLogs({
        page,
        limit,
        entityType: searchParams.entityType,
        action: searchParams.action,
        tenantId: searchParams.tenantId,
    });

    const stats = await getCrossTenantAuditLogStats();

    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">System Audit Logs</h2>
                <span className="text-xs text-muted-foreground">Cross-tenant: platform actions + all tenant activity</span>
            </div>
            
            <AuditLogClient 
                initialData={initialData}
                stats={stats}
                currentPage={page}
                limit={limit}
            />
        </div>
    );
}
