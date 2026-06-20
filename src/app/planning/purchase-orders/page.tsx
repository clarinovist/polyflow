import React from 'react';
import { Metadata } from 'next';
import { PurchaseService } from '@/services/purchasing/purchase-service';
import { PurchaseOrderTable } from '@/components/planning/purchasing/PurchaseOrderTable';
import { ShoppingCart } from 'lucide-react';
import { serializeData } from '@/lib/utils/utils';
import { planningLabels } from '@/lib/labels';

export const metadata: Metadata = {
    title: 'Purchase Orders | PolyFlow ERP',
    description: planningLabels.purchaseOrdersDesc,
};

export default async function PurchaseOrdersPage() {
    const orders = await PurchaseService.getPurchaseOrders();
    const stats = await PurchaseService.getPurchaseStats();

    // Serialize all Prisma objects for Client Components
    const serializedOrders = serializeData(orders);

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
                            {planningLabels.createTrackOrders}
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
                <div className="p-4 border rounded-lg bg-card text-card-foreground shadow-sm">
                    <div className="text-sm font-medium text-muted-foreground">{planningLabels.totalOrders}</div>
                    <div className="text-2xl font-bold">{stats.totalOrders}</div>
                </div>
                <div className="p-4 border rounded-lg bg-card text-card-foreground shadow-sm">
                    <div className="text-sm font-medium text-muted-foreground">{planningLabels.openSent}</div>
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.openOrders}</div>
                </div>
                <div className="p-4 border rounded-lg bg-card text-card-foreground shadow-sm">
                    <div className="text-sm font-medium text-muted-foreground">{planningLabels.completed}</div>
                    <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.completedOrders}</div>
                </div>
                <div className="p-4 border rounded-lg bg-card text-card-foreground shadow-sm">
                    <div className="text-sm font-medium text-muted-foreground">{planningLabels.totalSpend}</div>
                    <div className="text-2xl font-bold">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(stats.totalSpend)}
                    </div>
                </div>
            </div>

            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <PurchaseOrderTable orders={serializedOrders as any} />
        </div>
    );
}
