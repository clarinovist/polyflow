import React from 'react';
import { PurchaseService } from '@/services/purchasing/purchase-service';
import { GoodsReceiptTable } from '@/components/planning/purchasing/GoodsReceiptTable';
import { PackageSearch } from 'lucide-react';
import { serializeData } from '@/lib/utils/utils';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { UrlTransactionDateFilter } from '@/components/common/url-transaction-date-filter';
import { parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { PageHeader } from '@/components/ui/page-header';

export default async function MaklonReceiptsPage({ searchParams }: { searchParams: Promise<{ startDate?: string, endDate?: string }> }) {
    const params = await searchParams;
    const now = new Date();
    const defaultStart = startOfMonth(now);
    const defaultEnd = endOfMonth(now);

    const checkStart = params?.startDate ? parseISO(params.startDate) : defaultStart;
    const checkEnd = params?.endDate ? parseISO(params.endDate) : defaultEnd;

    const receipts = await PurchaseService.getGoodsReceipts({ 
        startDate: checkStart, 
        endDate: checkEnd,
        isMaklon: true 
    });

    const serializedReceipts = serializeData(receipts);

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title="Maklon Receipts"
                description="Manage inward materials owned by customers for Maklon Jasa orders"
                actions={
                    <>
                        <Link href="/warehouse/incoming/create-maklon" passHref>
                            <Button className="bg-purple-600 hover:bg-purple-700 h-9 shrink-0 gap-2">
                                <PackageSearch className="h-4 w-4" />
                                New Maklon Receipt
                            </Button>
                        </Link>
                        <UrlTransactionDateFilter defaultPreset="this_month" />
                    </>
                }
            />
            <GoodsReceiptTable
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                receipts={serializedReceipts as any}
                basePath="/dashboard/maklon/receipts"
            />
        </div>
    );
}
