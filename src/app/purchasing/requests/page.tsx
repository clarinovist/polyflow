import type { ComponentProps } from 'react';
import { getPurchaseRequests } from '@/actions/purchasing/purchasing';
import { getSuppliers } from '@/actions/purchasing/supplier';
import { RequestList } from './RequestList';
import { Metadata } from 'next';
import { purchasingLabels } from '@/lib/labels';
import { PurchaseRequestStatus } from '@prisma/client';
import { auth } from '@/auth';
import { getUserRoles } from '@/lib/auth/roles';
import { PageHeader } from '@/components/ui/page-header';
import { ListResultSummary } from '@/components/ui/list-result-summary';

export const metadata: Metadata = {
    title: 'Permintaan Pembelian',
    description: 'Kelola permintaan pembelian internal.',
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const VALID_PR_STATUS = new Set(Object.values(PurchaseRequestStatus));

export default async function PurchaseRequestsPage(props: {
    searchParams: SearchParams;
}) {
    const searchParams = await props.searchParams;
    const statusParam =
        typeof searchParams.status === 'string'
            ? searchParams.status
            : undefined;
    const statusFilter =
        statusParam && VALID_PR_STATUS.has(statusParam as PurchaseRequestStatus)
            ? (statusParam as PurchaseRequestStatus)
            : undefined;

    // Determine canApprove from session roles — fail-closed on error
    let canApprove = false;
    try {
        const session = await auth();
        if (session?.user) {
            const roles = getUserRoles(session.user);
            canApprove =
                roles.includes('ADMIN') || roles.includes('PROCUREMENT');
        }
    } catch {
        canApprove = false;
    }

    const [requestsRes, suppliersRes] = await Promise.all([
        getPurchaseRequests(
            statusFilter ? { status: statusFilter } : undefined,
        ),
        getSuppliers(),
    ]);

    if (!requestsRes.success) {
        return (
            <div className="space-y-4 p-4 md:p-6">
                <h1 className="text-2xl font-bold md:text-3xl">
                    {purchasingLabels.purchaseRequest}
                </h1>
                <p role="alert" className="text-destructive">
                    {requestsRes.error || 'Gagal memuat permintaan pembelian.'}
                </p>
                <p className="text-sm text-muted-foreground">
                    Data tidak dianggap kosong.
                </p>
            </div>
        );
    }
    const requests = requestsRes.data ?? [];
    const suppliers =
        suppliersRes.success && suppliersRes.data ? suppliersRes.data : [];

    return (
        <div className="flex-1 space-y-4 p-4 md:p-6">
            <PageHeader
                title={purchasingLabels.purchaseRequest}
                description={
                    statusFilter
                        ? `Filter status: ${statusFilter}`
                        : 'Kelola permintaan pembelian internal.'
                }
            />
            <ListResultSummary
                start={requests.length > 0 ? 1 : 0}
                end={requests.length}
                total={requests.length}
            />
            <RequestList
                requests={
                    requests as unknown as ComponentProps<
                        typeof RequestList
                    >['requests']
                }
                suppliers={suppliers}
                canApprove={canApprove}
            />
        </div>
    );
}
