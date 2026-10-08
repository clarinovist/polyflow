import React, { type ComponentProps } from 'react';
import { Metadata } from 'next';
import { PurchaseService } from '@/services/purchasing/purchase-service';
import { PurchaseOrderTable } from '@/components/purchasing/orders/PurchaseOrderTable';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { serializeData } from '@/lib/utils/utils';
import { withTenantPage } from '@/lib/core/tenant';
import { PurchaseOrderStatus } from '@prisma/client';
import { PURCHASE_ORDER_SORTS } from '@/services/purchasing/orders-service';
import {
    parsePurchasingDateBounds,
    parsePurchasingPageParam,
    parsePurchasingSort,
} from '@/lib/purchasing/paged-list';

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const getOrdersData = withTenantPage(
    async (
        filters: Parameters<typeof PurchaseService.getPurchaseOrdersPage>[0],
    ) => PurchaseService.getPurchaseOrdersPage(filters),
);

export const metadata: Metadata = {
    title: 'Order Pembelian (PO)',
    description: 'Kelola procurement dan pesanan supplier.',
};

export default async function PurchaseOrdersPage(props: {
    searchParams: SearchParams;
}) {
    const searchParams = await props.searchParams;
    const statusParam =
        typeof searchParams.status === 'string'
            ? searchParams.status
            : undefined;
    const validStatuses = (statusParam?.split(',') ?? []).filter(
        (s): s is PurchaseOrderStatus =>
            Object.values(PurchaseOrderStatus).includes(
                s as PurchaseOrderStatus,
            ),
    );
    const statusFilter:
        | PurchaseOrderStatus
        | PurchaseOrderStatus[]
        | undefined =
        validStatuses.length === 0
            ? undefined
            : validStatuses.length === 1
              ? validStatuses[0]
              : validStatuses;

    const search =
        typeof searchParams.search === 'string'
            ? searchParams.search
            : undefined;
    const startDate =
        typeof searchParams.startDate === 'string'
            ? searchParams.startDate
            : undefined;
    const endDate =
        typeof searchParams.endDate === 'string'
            ? searchParams.endDate
            : undefined;
    const dateBounds = parsePurchasingDateBounds(startDate, endDate);
    const sorting = parsePurchasingSort(
        typeof searchParams.sort === 'string' ? searchParams.sort : undefined,
        typeof searchParams.direction === 'string'
            ? searchParams.direction
            : undefined,
        PURCHASE_ORDER_SORTS,
        'orderDate',
    );
    let ordersPage: Awaited<ReturnType<typeof getOrdersData>>;
    try {
        ordersPage = await getOrdersData({
            page: parsePurchasingPageParam(
                typeof searchParams.page === 'string'
                    ? searchParams.page
                    : undefined,
            ),
            pageSize: parsePurchasingPageParam(
                typeof searchParams.pageSize === 'string'
                    ? searchParams.pageSize
                    : undefined,
            ),
            search,
            status: statusFilter,
            ...dateBounds,
            ...sorting,
        });
    } catch {
        return (
            <div className="space-y-4 p-4 md:p-6">
                <h1 className="text-2xl font-bold md:text-3xl">
                    Order Pembelian (PO)
                </h1>
                <p role="alert" className="text-destructive">
                    Gagal memuat order pembelian.
                </p>
                <p className="text-sm text-muted-foreground">
                    Data tidak dianggap kosong. Muat ulang halaman untuk mencoba
                    lagi.
                </p>
            </div>
        );
    }

    return (
        <div className="flex min-w-0 flex-col gap-6 p-4 md:p-6">
            <PageHeader
                title="Order Pembelian (PO)"
                description="Kelola procurement dan pesanan supplier."
                actions={
                    <Button asChild>
                        <Link href="/purchasing/orders/create">
                            <Plus aria-hidden="true" className="h-4 w-4" />
                            Buat PO
                        </Link>
                    </Button>
                }
            />

            <PurchaseOrderTable
                orders={
                    serializeData(
                        ordersPage.items,
                    ) as unknown as ComponentProps<
                        typeof PurchaseOrderTable
                    >['orders']
                }
                pagination={{
                    page: ordersPage.page,
                    pageSize: ordersPage.pageSize,
                    totalCount: ordersPage.totalCount,
                    totalPages: ordersPage.totalPages,
                }}
                initialSearch={search}
                initialStatus={statusParam ?? 'all'}
                initialStartDate={dateBounds.startDate ? startDate : undefined}
                initialEndDate={dateBounds.endDate ? endDate : undefined}
                sort={sorting.sort}
                direction={sorting.direction}
            />
        </div>
    );
}
