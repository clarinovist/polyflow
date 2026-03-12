import { getAuditLogs, getAuditLogStats } from '@/actions/audit-log';
import AuditLogClient from './AuditLogClient';

export const metadata = {
    title: 'Audit Logs | PolyFlow Admin',
    description: 'System audit and security trails',
};

interface SearchParams {
    page?: string;
    userId?: string;
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

    // Fetch initial data based on URL search params
    const initialData = await getAuditLogs({
        page,
        limit,
        userId: searchParams.userId,
        entityType: searchParams.entityType,
        action: searchParams.action
    });

    const stats = await getAuditLogStats();

    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">System Audit Logs</h2>
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
