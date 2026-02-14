import React from 'react';
import { PurchaseService } from '@/services/purchase-service';
import { GoodsReceiptTable } from '@/components/planning/purchasing/GoodsReceiptTable';
import { Metadata } from 'next';
import { PackageSearch } from 'lucide-react';
import { serializeData } from '@/lib/utils';

import { UrlTransactionDateFilter } from '@/components/ui/url-transaction-date-filter';
import { parseISO, startOfMonth, endOfMonth } from 'date-fns';

export const metadata: Metadata = {
    title: 'Incoming Receipts | Warehouse | PolyFlow',
};

export default async function WarehouseIncomingPage({ searchParams }: { searchParams: Promise<{ startDate?: string, endDate?: string }> }) {
    const params = await searchParams;
    const now = new Date();
    const defaultStart = startOfMonth(now);
    const defaultEnd = endOfMonth(now);

    const checkStart = params?.startDate ? parseISO(params.startDate) : defaultStart;
    const checkEnd = params?.endDate ? parseISO(params.endDate) : defaultEnd;

    const receipts = await PurchaseService.getGoodsReceipts({ startDate: checkStart, endDate: checkEnd });

    // Serialize all Prisma objects for Client Components
    const serializedReceipts = serializeData(receipts);

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                        <PackageSearch className="h-3 w-3" />
                        <span>Warehouse / Incoming Receipts</span>
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight">Incoming Stock Receipts</h1>
                    <p className="text-muted-foreground">View and manage all incoming stock deliveries from suppliers.</p>
                </div>
                <div>
                    <UrlTransactionDateFilter defaultPreset="this_month" />
                </div>
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
