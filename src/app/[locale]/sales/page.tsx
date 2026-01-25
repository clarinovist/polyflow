import { getSalesDashboardStats } from '@/actions/sales-dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SalesOrderTable } from '@/components/sales/SalesOrderTable';
import { serializeData, formatRupiah } from '@/lib/utils';
import { Package, ShoppingCart, TrendingUp, Users, Plus, FileText } from 'lucide-react';
import Link from 'next/link';

export default async function SalesDashboardPage({
    params
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;
    const stats = await getSalesDashboardStats();
    const serializedOrders = serializeData(stats.recentOrders);

    return (
        <div className="flex flex-col space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Sales Dashboard</h1>
                    <p className="text-muted-foreground">Overview of sales performance for this month.</p>
                </div>
                <div className="flex gap-2">
                    <Button asChild variant="outline">
                        <Link href="/sales/quotations/create">
                            <FileText className="mr-2 h-4 w-4" />
                            New Quotation
                        </Link>
                    </Button>
                    <Button asChild>
                        <Link href="/sales/orders/create">
                            <Plus className="mr-2 h-4 w-4" />
                            New Order
                        </Link>
                    </Button>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Total Revenue
                        </CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatRupiah(stats.revenue)}</div>
                        <p className="text-xs text-muted-foreground">
                            +0% from last month (Mock)
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Active Orders
                        </CardTitle>
                        <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.activeOrders}</div>
                        <p className="text-xs text-muted-foreground">
                            Orders in progress
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Pending Deliveries
                        </CardTitle>
                        <Package className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.pendingDeliveries}</div>
                        <p className="text-xs text-muted-foreground">
                            Ready to ship
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Active Customers
                        </CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.activeCustomers}</div>
                        <p className="text-xs text-muted-foreground">
                            Total active base
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Recent Orders Table */}
            <div className="grid gap-4 md:grid-cols-1">
                <Card>
                    <CardHeader>
                        <CardTitle>Recent Sales Orders</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        <SalesOrderTable initialData={serializedOrders as any} basePath={`/${locale}/sales/orders`} />
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
