import { getSalesOrders } from '@/actions/sales';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { SalesOrderTable } from '@/components/sales/SalesOrderTable';

export default async function SalesPage() {
    const orders = await getSalesOrders();

    return (
        <div className="flex flex-col space-y-6 p-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Sales Orders</h1>
                    <p className="text-muted-foreground">Manage customer orders and shipments.</p>
                </div>
                <Button asChild>
                    <Link href="/dashboard/sales/create">
                        <Plus className="mr-2 h-4 w-4" />
                        New Sales Order
                    </Link>
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Recent Orders</CardTitle>
                </CardHeader>
                <CardContent>
                    <SalesOrderTable initialData={orders.map((order) => ({
                        ...order,
                        totalAmount: order.totalAmount ? Number(order.totalAmount) : null,
                        customer: order.customer ? {
                            ...order.customer,
                            creditLimit: order.customer.creditLimit ? Number(order.customer.creditLimit) : null,
                            discountPercent: order.customer.discountPercent ? Number(order.customer.discountPercent) : null
                        } : null
                    }))} />
                </CardContent>
            </Card>
        </div>
    );
}
