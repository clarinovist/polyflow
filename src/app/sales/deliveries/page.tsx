import { getDeliveryOrders } from '@/actions/inventory/deliveries';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DeliveryOrderTable } from '@/components/sales/DeliveryOrderTable';
import { CreateDeliveryOrderDialog } from '@/components/sales/CreateDeliveryOrderDialog';
import { serializeData } from '@/lib/utils/utils';
import { salesLabels } from '@/lib/labels';
import { Package, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

import { UrlTransactionDateFilter } from '@/components/common/url-transaction-date-filter';
import { parseISO, startOfMonth, endOfMonth } from 'date-fns';

export default async function SalesDeliveriesPage({ searchParams }: { searchParams: Promise<{ startDate?: string, endDate?: string }> }) {
    const params = await searchParams;
    const now = new Date();
    const defaultStart = startOfMonth(now);
    const defaultEnd = endOfMonth(now);

    const checkStart = params?.startDate ? parseISO(params.startDate) : defaultStart;
    const checkEnd = params?.endDate ? parseISO(params.endDate) : defaultEnd;

    const deliveryOrders = await getDeliveryOrders({ startDate: checkStart, endDate: checkEnd });
    const serializedOrders = deliveryOrders.success && deliveryOrders.data ? serializeData(deliveryOrders.data) : [];

    return (
        <div className="flex flex-col space-y-6 p-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{salesLabels.deliveryOrders}</h1>
                    <p className="text-muted-foreground">{salesLabels.deliveryOrdersDesc}</p>
                </div>
                <div className="flex items-center gap-3">
                    <UrlTransactionDateFilter defaultPreset="this_month" />
                    <CreateDeliveryOrderDialog />
                </div>
            </div>

            <Alert className="bg-background border-blue-500/20 text-blue-600 dark:text-blue-400">
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                    Ini adalah dokumen <strong>Surat Jalan (Delivery Order)</strong> — bukti pengiriman resmi ke customer.
                    Antrian Sales Order untuk diproses gudang ada di modul <strong>Gudang → Antrian Kirim (SO)</strong>.
                </AlertDescription>
            </Alert>

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
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <DeliveryOrderTable initialData={serializedOrders as any} />
                </CardContent>
            </Card>
        </div >
    );
}
