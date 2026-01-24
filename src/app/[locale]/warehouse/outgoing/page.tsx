import { getSalesOrders } from '@/actions/sales';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SalesOrderTable } from '@/components/sales/SalesOrderTable';
import { serializeData } from '@/lib/utils';

export default async function WarehouseOutgoingPage() {
    const orders = await getSalesOrders();

    // Serialize all Prisma objects for Client Components
    const serializedOrders = serializeData(orders);

    return (
        <div className="flex flex-col space-y-6 p-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Outgoing Orders</h1>
                    <p className="text-muted-foreground">Manage shipments and deliveries to customers.</p>
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
