import React, { type ComponentProps } from 'react';
import { Metadata } from 'next';
import { PurchaseService } from '@/services/purchasing/purchase-service';
import { PurchaseOrderTable } from '@/components/purchasing/orders/PurchaseOrderTable';
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
    async (filters: Parameters<typeof PurchaseService.getPurchaseOrdersPage>[0]) =>
        PurchaseService.getPurchaseOrdersPage(filters),
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
        typeof searchParams.search === 'string' ? searchParams.search : undefined;
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
    const ordersPage = await getOrdersData({
        page: parsePurchasingPageParam(
            typeof searchParams.page === 'string' ? searchParams.page : undefined,
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

    return (
        <div className="flex flex-col gap-6 p-6">
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">
                            Order Pembelian (PO)
                        </h1>
                        <p className="text-muted-foreground">
                            Kelola procurement dan pesanan supplier.
                        </p>
                    </div>
                </div>
            </div>

            <PurchaseOrderTable
                orders={
                    serializeData(ordersPage.items) as unknown as ComponentProps<
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
