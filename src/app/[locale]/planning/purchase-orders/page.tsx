import React from 'react';
import { Metadata } from 'next';
import { PurchaseService } from '@/services/purchase-service';
import { PurchaseOrderTable } from '@/components/planning/purchasing/PurchaseOrderTable';
import { ShoppingCart } from 'lucide-react';
import { serializeData } from '@/lib/utils';

export const metadata: Metadata = {
    title: 'Purchase Orders | PolyFlow ERP',
    description: 'Manage your procurement and supplier orders.',
};

export default async function PurchaseOrdersPage() {
    const orders = await PurchaseService.getPurchaseOrders();

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
                            Create and track orders sent to your suppliers.
                        </p>
                    </div>
                </div>
            </div>

            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <PurchaseOrderTable orders={serializedOrders as any} />
        </div>
    );
}
