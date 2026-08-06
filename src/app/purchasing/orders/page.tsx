import React, { type ComponentProps } from 'react';
import { Metadata } from 'next';
import { PurchaseService } from '@/services/purchasing/purchase-service';
import { PurchaseOrderTable } from '@/components/purchasing/orders/PurchaseOrderTable';
import { serializeData } from '@/lib/utils/utils';
import { withTenantPage } from '@/lib/core/tenant';
import { PurchaseOrderStatus } from '@prisma/client';

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const getOrdersData = withTenantPage(
    async (statusFilter?: PurchaseOrderStatus | PurchaseOrderStatus[]) => {
        const filters = statusFilter ? { status: statusFilter } : undefined;
        const orders = await PurchaseService.getPurchaseOrders(filters);
        const stats = await PurchaseService.getPurchaseStats();
        return { orders, stats };
    },
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

    const { orders } = await getOrdersData(statusFilter);

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
                    serializeData(orders) as unknown as ComponentProps<
                        typeof PurchaseOrderTable
                    >['orders']
                }
            />
        </div>
    );
}
