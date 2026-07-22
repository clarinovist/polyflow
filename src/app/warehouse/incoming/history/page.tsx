import React from 'react';
import { PurchaseService } from '@/services/purchasing/purchase-service';
import { GoodsReceiptTable } from '@/components/purchasing/orders/GoodsReceiptTable';
import { Metadata } from 'next';
import { serializeData } from '@/lib/utils/utils';
import { UrlTransactionDateFilter } from '@/components/common/url-transaction-date-filter';
import { parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { withTenantPage } from '@/lib/core/tenant';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

const getReceipts = withTenantPage(async (opts) => {
    return PurchaseService.getGoodsReceipts(opts);
});

export const metadata: Metadata = {
    title: 'Riwayat Penerimaan Barang | Warehouse | PolyFlow',
};

export default async function WarehouseIncomingHistoryPage({
    searchParams,
}: {
    searchParams: Promise<{ startDate?: string; endDate?: string }>;
}) {
    const params = await searchParams;
    const now = new Date();
    const defaultStart = startOfMonth(now);
    const defaultEnd = endOfMonth(now);
    const checkStart = params?.startDate ? parseISO(params.startDate) : defaultStart;
    const checkEnd = params?.endDate ? parseISO(params.endDate) : defaultEnd;
    const receipts = await getReceipts({ startDate: checkStart, endDate: checkEnd });
    const serializedReceipts = serializeData(receipts);

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                        <Button variant="outline" size="sm" asChild>
                            <Link href="/warehouse/incoming">
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                Antrean
                            </Link>
                        </Button>
                        <h1 className="text-3xl font-bold tracking-tight">Riwayat Penerimaan</h1>
                    </div>
                    <p className="text-muted-foreground">
                        Lihat riwayat semua penerimaan barang dari supplier.
                    </p>
                </div>
                <UrlTransactionDateFilter defaultPreset="this_month" />
            </div>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <GoodsReceiptTable receipts={serializedReceipts as any} basePath="/warehouse/incoming" />
        </div>
    );
}
