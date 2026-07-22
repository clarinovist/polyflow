import { getDeliveryOrders } from '@/actions/inventory/deliveries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DeliveryOrderTable } from '@/components/sales/DeliveryOrderTable';
import { serializeData } from '@/lib/utils/utils';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { UrlTransactionDateFilter } from '@/components/common/url-transaction-date-filter';
import { warehouseLabels } from '@/lib/labels';

export default async function WarehouseOutgoingHistoryPage({
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

    const result = await getDeliveryOrders({ startDate: checkStart, endDate: checkEnd });

    const orders = result.success && result.data ? serializeData(result.data) : [];
    const closedOrders = orders.filter(
        (o: { status: string }) => o.status !== 'PENDING' && o.status !== 'LOADING',
    );

    return (
        <div className="flex flex-col space-y-6 p-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="sm" asChild>
                        <Link href="/warehouse/outgoing">
                            <ArrowLeft className="mr-2 h-4 w-4" /> Kembali
                        </Link>
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">
                            {warehouseLabels.outgoingHistory}
                        </h1>
                        <p className="text-muted-foreground">
                            Pengiriman yang sudah selesai diproses gudang.
                        </p>
                    </div>
                </div>
                <UrlTransactionDateFilter defaultPreset="this_month" />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Riwayat Pengiriman ({closedOrders.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    <DeliveryOrderTable
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        initialData={closedOrders as any}
                        basePath="/warehouse/outgoing"
                        mode="history"
                    />
                </CardContent>
            </Card>
        </div>
    );
}
