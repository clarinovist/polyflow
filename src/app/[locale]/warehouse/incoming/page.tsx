import React from 'react';
import { PurchaseService } from '@/services/purchase-service';
import { GoodsReceiptTable } from '@/components/planning/purchasing/GoodsReceiptTable';
import { Metadata } from 'next';
import { PackageSearch } from 'lucide-react';
import { serializeData } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';

export const metadata: Metadata = {
    title: 'Incoming Receipts | Warehouse | PolyFlow',
};

export default async function WarehouseIncomingPage() {
    const receipts = await PurchaseService.getGoodsReceipts();

    // Serialize all Prisma objects for Client Components
    const serializedReceipts = serializeData(receipts);

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <PackageSearch className="h-3 w-3" />
                    <span>Warehouse / Incoming Receipts</span>
                </div>
                <PageHeader
                    title="Incoming Stock Receipts"
                    description="View and manage all incoming stock deliveries from suppliers."
                />
            </div>

            {/* Use the refactored GoodsReceiptTable with the warehouse base path */}
            <GoodsReceiptTable
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                receipts={serializedReceipts as any}
                basePath="/warehouse/incoming"
            />
        </div>
    );
}
