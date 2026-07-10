import { getSalesOrders } from '@/actions/sales/sales';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SalesOrderTable } from '@/components/sales/SalesOrderTable';
import { serializeData } from '@/lib/utils/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Info, Truck } from 'lucide-react';
import Link from 'next/link';

import { UrlTransactionDateFilter } from '@/components/common/url-transaction-date-filter';
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
    const serializedOrders = orders.success && orders.data ? serializeData(orders.data) : [];

    return (
        <div className="flex flex-col space-y-6 p-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Antrian Kirim (SO)</h1>
                    <p className="text-muted-foreground">Sales Order yang siap/perlu diproses gudang. Surat Jalan (DO) dikelola di Sales.</p>
                </div>
                <div className="flex items-center gap-3">
                    <UrlTransactionDateFilter defaultPreset="this_month" />
                    <Button variant="outline" asChild>
                        <Link href="/sales/deliveries">
                            <Truck className="mr-2 h-4 w-4" />
                            Lihat Surat Jalan
                        </Link>
                    </Button>
                </div>
            </div>

            <Alert className="bg-background border-blue-500/20 text-blue-600 dark:text-blue-400">
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                    <strong>Alur:</strong> SO di bawah ini adalah antrian untuk diproses gudang.
                    Surat Jalan (Delivery Order) dibuat dan dikelola di modul <strong>Sales → Pengiriman</strong>.
                    Status pengiriman fisik mengacu pada dokumen Surat Jalan, bukan status SO di sini.
                </AlertDescription>
            </Alert>

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
