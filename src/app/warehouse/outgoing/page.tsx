import { getSalesOrders } from '@/actions/sales';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SalesOrderTable } from '@/components/sales/SalesOrderTable';
import { serializeData } from '@/lib/utils';

import { UrlTransactionDateFilter } from '@/components/ui/url-transaction-date-filter';
import { parseISO, startOfMonth, endOfMonth } from 'date-fns';

export default async function WarehouseOutgoingPage({ searchParams }: { searchParams: Promise<{ startDate?: string, endDate?: string }> }) {
    const params = await searchParams;
    const now = new Date();
    const defaultStart = startOfMonth(now);
    const defaultEnd = endOfMonth(now);

    const checkStart = params?.startDate ? parseISO(params.startDate) : defaultStart;
    const checkEnd = params?.endDate ? parseISO(params.endDate) : defaultEnd;

    const orders = await getSalesOrders(false, { startDate: checkStart, endDate: checkEnd });

    // Serialize all Prisma objects for Client Components
    const serializedOrders = serializeData(orders);

    return (
        <div className="flex flex-col space-y-6 p-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Outgoing Orders</h1>
                    <p className="text-muted-foreground">Manage shipments and deliveries to customers.</p>
                </div>
                <div>
                    <UrlTransactionDateFilter defaultPreset="this_month" />
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Sales Orders</CardTitle>
                </CardHeader>
                <CardContent>
                    <SalesOrderTable
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        initialData={serializedOrders as any}
                        basePath="/warehouse/outgoing"
                    />
                </CardContent>
            </Card>
        </div>
    );
}
