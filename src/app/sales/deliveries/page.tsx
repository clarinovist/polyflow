import type { ComponentProps } from 'react';
import { getDeliveryOrders } from '@/actions/inventory/deliveries';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from '@/components/ui/card';
import { DeliveryOrderTable } from '@/components/sales/DeliveryOrderTable';
import { CreateDeliveryOrderDialog } from '@/components/sales/CreateDeliveryOrderDialog';
import { serializeData } from '@/lib/utils/utils';
import { salesLabels } from '@/lib/labels';
import { Package } from 'lucide-react';
import { SalesMetricInfo } from '@/components/sales/SalesMetricInfo';
import Link from 'next/link';

import { UrlTransactionDateFilter } from '@/components/common/url-transaction-date-filter';
import { parseISO, startOfMonth, endOfMonth } from 'date-fns';

export default async function SalesDeliveriesPage({
    searchParams,
}: {
    searchParams: Promise<{ startDate?: string; endDate?: string }>;
}) {
    const params = await searchParams;
    const now = new Date();
    const defaultStart = startOfMonth(now);
    const defaultEnd = endOfMonth(now);

    const checkStart = params?.startDate
        ? parseISO(params.startDate)
        : defaultStart;
    const checkEnd = params?.endDate ? parseISO(params.endDate) : defaultEnd;

    const deliveryOrders = await getDeliveryOrders({
        startDate: checkStart,
        endDate: checkEnd,
    });
    const serializedOrders =
        deliveryOrders.success && deliveryOrders.data
            ? serializeData(deliveryOrders.data)
            : [];

    return (
        <div className="flex flex-col space-y-6 p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        {salesLabels.deliveryOrders}
                    </h1>
                    <p className="text-muted-foreground">
                        {salesLabels.deliveryOrdersDesc}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <UrlTransactionDateFilter defaultPreset="this_month" />
                    <CreateDeliveryOrderDialog />
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                <div className="flex items-center gap-1">
                    <span>Surat Jalan & proses pengiriman</span>
                    <SalesMetricInfo label="Info Surat Jalan">
                        <p>
                            Surat Jalan adalah dokumen pengiriman ke customer.
                            PENDING / LOADING berarti draft muat: stok belum
                            dipotong dan qty masih bisa diubah di detail SJ.
                        </p>
                        <p>
                            {salesLabels.openSjPendingList} Filter memakai
                            tanggal pengiriman; SJ draft tetap ikut tampil.
                        </p>
                        <p>
                            Muat, verifikasi, dan tandai dikirim dilakukan di
                            Portal Gudang.
                        </p>
                    </SalesMetricInfo>
                </div>
                <Link
                    href="/warehouse/outgoing"
                    className="inline-flex min-h-11 items-center text-sm underline underline-offset-4 hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
                >
                    Buka Portal Gudang →
                </Link>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Package className="h-5 w-5" />
                        {salesLabels.allDeliveries}
                    </CardTitle>
                    <CardDescription>
                        {salesLabels.allDeliveriesDesc}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <DeliveryOrderTable
                        initialData={
                            serializedOrders as unknown as ComponentProps<
                                typeof DeliveryOrderTable
                            >['initialData']
                        }
                    />
                </CardContent>
            </Card>
        </div>
    );
}
