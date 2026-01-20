import React from 'react';
import { PurchaseService } from '@/services/purchase-service';
import { GoodsReceiptTable } from '@/components/purchasing/GoodsReceiptTable';
import { Metadata } from 'next';
import { ShoppingCart } from 'lucide-react';
import { serializeForClient } from '@/lib/serialize';

export const metadata: Metadata = {
    title: 'Goods Receipts | PolyFlow',
};

export default async function GoodsReceiptsPage() {
    const receipts = await PurchaseService.getGoodsReceipts();

    // Serialize all Prisma objects for Client Components
    const serializedReceipts = serializeForClient(receipts);

    return (
        <div className="flex flex-col gap-6 p-6">
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <ShoppingCart className="h-3 w-3" />
                    <span>Procurement / Goods Receipts</span>
                </div>
                <h1 className="text-2xl font-bold tracking-tight">Goods Receipts</h1>
                <p className="text-muted-foreground">
                    History of all incoming stock deliveries.
                </p>
            </div>

            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <GoodsReceiptTable receipts={serializedReceipts as any} />
        </div>
    );
}
