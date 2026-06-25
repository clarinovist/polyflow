import React from 'react';
import { Metadata } from 'next';
import { PurchaseService } from '@/services/purchasing/purchase-service';
import { PurchaseOrderTable } from '@/components/purchasing/orders/PurchaseOrderTable';
import { ShoppingCart } from 'lucide-react';
import { serializeData } from '@/lib/utils/utils';
import { planningLabels } from '@/lib/labels';
import { withTenantPage } from '@/lib/core/tenant';

const getOrdersData = withTenantPage(async () => {
    const orders = await PurchaseService.getPurchaseOrders();
    const stats = await PurchaseService.getPurchaseStats();
    return { orders, stats };
});

export const metadata: Metadata = {
    title: 'Purchase Orders | PolyFlow ERP',
    description: planningLabels.purchaseOrdersDesc,
};

export default async function PurchaseOrdersPage() {
    const { orders } = await getOrdersData();

    return (
        <div className="flex flex-col gap-6 p-6">
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                            <ShoppingCart className="h-3 w-3" />
                            <span>Procurement / Purchase Orders</span>
                        </div>
                        <h1 className="text-2xl font-bold tracking-tight">Purchase Orders</h1>
                        <p className="text-muted-foreground">
                            Manage supplier purchase orders and track procurement.
                        </p>
                    </div>
                </div>
            </div>

            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <PurchaseOrderTable orders={serializeData(orders) as any} />
        </div>
    );
}
