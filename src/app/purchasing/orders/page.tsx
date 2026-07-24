import React from 'react';
import { Metadata } from 'next';
import { PurchaseService } from '@/services/purchasing/purchase-service';
import { PurchaseOrderTable } from '@/components/purchasing/orders/PurchaseOrderTable';
import { serializeData } from '@/lib/utils/utils';
import { withTenantPage } from '@/lib/core/tenant';
import { PurchaseOrderStatus } from '@prisma/client';

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

const getOrdersData = withTenantPage(async (statusFilter?: PurchaseOrderStatus) => {
    const filters = statusFilter ? { status: statusFilter } : undefined;
    const orders = await PurchaseService.getPurchaseOrders(filters);
    const stats = await PurchaseService.getPurchaseStats();
    return { orders, stats };
});

export const metadata: Metadata = {
    title: 'Order Pembelian (PO)',
    description: 'Kelola procurement dan pesanan supplier.',
};

export default async function PurchaseOrdersPage(props: { searchParams: SearchParams }) {
    const searchParams = await props.searchParams;
    const statusParam = typeof searchParams.status === 'string' ? searchParams.status : undefined;
    const statusFilter = statusParam && Object.values(PurchaseOrderStatus).includes(statusParam as PurchaseOrderStatus)
        ? (statusParam as PurchaseOrderStatus)
        : undefined;

    const { orders } = await getOrdersData(statusFilter);

    return (
        <div className="flex flex-col gap-6 p-6">
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Order Pembelian (PO)</h1>
                        <p className="text-muted-foreground">
                            Kelola procurement dan pesanan supplier.
                        </p>
                    </div>
                </div>
            </div>

            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <PurchaseOrderTable orders={serializeData(orders) as any} />
        </div>
    );
}
