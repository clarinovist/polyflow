import { getDeliveryOrders } from '@/actions/deliveries';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DeliveryOrderTable } from '@/components/sales/DeliveryOrderTable';
import { serializeData } from '@/lib/utils';
import { Package } from 'lucide-react';

import { UrlTransactionDateFilter } from '@/components/ui/url-transaction-date-filter';
import { parseISO, startOfMonth, endOfMonth } from 'date-fns';

export default async function SalesDeliveriesPage({ searchParams }: { searchParams: Promise<{ startDate?: string, endDate?: string }> }) {
    const params = await searchParams;
    const now = new Date();
    const defaultStart = startOfMonth(now);
    const defaultEnd = endOfMonth(now);

    const checkStart = params?.startDate ? parseISO(params.startDate) : defaultStart;
    const checkEnd = params?.endDate ? parseISO(params.endDate) : defaultEnd;

    const deliveryOrders = await getDeliveryOrders({ startDate: checkStart, endDate: checkEnd });
    const serializedOrders = serializeData(deliveryOrders);

    return (
        <div className="flex flex-col space-y-6 p-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Delivery Orders</h1>
                    <p className="text-muted-foreground">Manage outbound shipments and delivery status.</p>
                </div>
                <UrlTransactionDateFilter defaultPreset="this_month" />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Package className="h-5 w-5" />
                        All Deliveries
                    </CardTitle>
                    <CardDescription>
                        List of all delivery orders and their current status.
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
