import { getClosedDeliveryOrders } from '@/actions/inventory/deliveries';
import { DeliveryOrderTable } from '@/components/sales/DeliveryOrderTable';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { UrlTransactionDateFilter } from '@/components/common/url-transaction-date-filter';
import { serializeData } from '@/lib/utils/utils';
import { warehouseLabels } from '@/lib/labels';

export default async function WarehouseOutgoingHistoryPage({
    searchParams,
}: {
    searchParams: Promise<{ startDate?: string; endDate?: string }>;
}) {
    const params = await searchParams;
    const now = new Date();
    const startDate = params.startDate
        ? parseISO(params.startDate)
        : startOfMonth(now);
    const endDate = params.endDate ? parseISO(params.endDate) : endOfMonth(now);
    const result = await getClosedDeliveryOrders({ startDate, endDate });

    if (!result.success) {
        return (
            <div className="space-y-4 p-4 md:p-6">
                <h1 className="text-2xl font-bold md:text-3xl">
                    {warehouseLabels.outgoingHistory}
                </h1>
                <p role="alert" className="text-destructive">
                    {result.error || 'Gagal memuat riwayat pengiriman.'}
                </p>
                <p className="text-sm text-muted-foreground">
                    Data tidak dianggap kosong. Muat ulang halaman untuk mencoba
                    lagi.
                </p>
            </div>
        );
    }

    const closedOrders = serializeData(result.data ?? []);
    return (
        <div className="flex min-w-0 flex-col gap-6 p-4 md:p-6">
            <PageHeader
                title={warehouseLabels.outgoingHistory}
                description="Pengiriman berstatus tertutup pada periode terpilih; PENDING/LOADING tidak masuk riwayat."
                actions={
                    <>
                        <Button variant="outline" asChild>
                            <Link href="/warehouse/outgoing">
                                <ArrowLeft
                                    aria-hidden="true"
                                    className="h-4 w-4"
                                />
                                Antrean aktif
                            </Link>
                        </Button>
                        <UrlTransactionDateFilter defaultPreset="this_month" />
                    </>
                }
            />
            <p className="text-sm text-muted-foreground" role="status">
                {closedOrders.length} pengiriman tertutup
            </p>
            <DeliveryOrderTable
                initialData={closedOrders}
                basePath="/warehouse/outgoing"
                mode="history"
                emptyMessage="Belum ada pengiriman tertutup pada periode ini."
            />
        </div>
    );
}
