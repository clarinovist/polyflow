import React from 'react';
import { PurchaseService } from '@/services/purchase-service';
import { getLocations } from '@/actions/inventory';
import { notFound } from 'next/navigation';
import { GoodsReceiptForm } from '@/components/purchasing/GoodsReceiptForm';
import { Metadata } from 'next';
import { ShoppingCart } from 'lucide-react';
import { serializeData } from '@/lib/utils';

export const metadata: Metadata = {
    title: 'Post Goods Receipt | PolyFlow Warehouse',
};

interface PageProps {
    searchParams: Promise<{
        poId?: string;
    }>;
}

export default async function WarehouseCreateReceiptPage({ searchParams }: PageProps) {
    const { poId } = await searchParams;

    if (!poId) {
        notFound();
    }

    const [order, locations] = await Promise.all([
        PurchaseService.getPurchaseOrderById(poId),
        getLocations()
    ]);

    if (!order) {
        notFound();
    }

    // Serialize all Prisma objects for Client Components
    const serializedOrder = serializeData(order);
    const serializedLocations = serializeData(locations);

    // Map order items for form
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = (serializedOrder as any).items.map((item: any) => ({
        productVariantId: item.productVariantId,
        productName: item.productVariant.name,
        skuCode: item.productVariant.skuCode,
        orderedQty: Number(item.quantity),
        receivedQty: Number(item.receivedQty),
        unitPrice: Number(item.unitPrice),
        unit: item.productVariant.primaryUnit
    }));

    return (
        <div className="flex flex-col gap-6 p-6 max-w-6xl mx-auto">
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ShoppingCart className="h-3 w-3" />
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <span>Incoming / PO {(serializedOrder as any).orderNumber} / Post Receipt</span>
                </div>
                <h1 className="text-2xl font-bold tracking-tight">Post Goods Receipt</h1>
                <p className="text-muted-foreground">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    Record incoming stock items for Purchase Order <span className="font-bold text-blue-600">#{(serializedOrder as any).orderNumber}</span>.
                </p>
            </div>

            <GoodsReceiptForm
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                purchaseOrderId={(serializedOrder as any).id}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                orderNumber={(serializedOrder as any).orderNumber}
                items={items}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                locations={serializedLocations.map((l: any) => ({ id: l.id, name: l.name }))}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                defaultLocationId={serializedLocations.find((l: any) => l.name.toLowerCase().includes('raw material'))?.id}
                basePath="/warehouse/incoming/orders"
            />
        </div>
    );
}
