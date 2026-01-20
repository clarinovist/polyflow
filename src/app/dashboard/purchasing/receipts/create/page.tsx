import React from 'react';
import { PurchaseService } from '@/services/purchase-service';
import { getLocations } from '@/actions/inventory';
import { notFound } from 'next/navigation';
import { GoodsReceiptForm } from '@/components/purchasing/GoodsReceiptForm';
import { Metadata } from 'next';
import { ShoppingCart } from 'lucide-react';
import { serializeForClient } from '@/lib/serialize';

export const metadata: Metadata = {
    title: 'Post Goods Receipt | PolyFlow',
};

interface PageProps {
    searchParams: Promise<{
        poId?: string;
    }>;
}

export default async function CreateReceiptPage({ searchParams }: PageProps) {
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
    const serializedOrder = serializeForClient(order);
    const serializedLocations = serializeForClient(locations);

    // Map order items for form - explicitly convert to numbers to avoid string comparison issues
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = serializedOrder.items.map((item: any) => ({
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
                    <span>Procurement / PO {serializedOrder.orderNumber} / Post Receipt</span>
                </div>
                <h1 className="text-2xl font-bold tracking-tight">Post Goods Receipt</h1>
                <p className="text-muted-foreground">
                    Record incoming stock items for Purchase Order <span className="font-bold text-blue-600">#{serializedOrder.orderNumber}</span>.
                </p>
            </div>

            <GoodsReceiptForm
                purchaseOrderId={serializedOrder.id}
                orderNumber={serializedOrder.orderNumber}
                items={items}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                locations={serializedLocations.map((l: any) => ({ id: l.id, name: l.name }))}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                defaultLocationId={serializedLocations.find((l: any) => l.name.toLowerCase().includes('raw material'))?.id}
            />
        </div>
    );
}
