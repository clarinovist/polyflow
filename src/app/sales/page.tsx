import { getSalesDashboardStats } from '@/actions/sales-dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SalesOrderTable } from '@/components/sales/SalesOrderTable';
import { serializeData, formatRupiah } from '@/lib/utils';
import { Package, ShoppingCart, TrendingUp, Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { AnalyticsToolbar } from '@/components/analytics/AnalyticsToolbar';
import { RevenueChart } from '@/components/sales/analytics/RevenueChart';
import { TopProductsList, TopCustomersList } from '@/components/sales/analytics/TopLists';

import { SalesMetrics } from '@/services/analytics-service';

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function SalesDashboardPage(props: { searchParams: SearchParams }) {
    const searchParams = await props.searchParams;
    const from = typeof searchParams.from === 'string' ? new Date(searchParams.from) : undefined;
    const to = typeof searchParams.to === 'string' ? new Date(searchParams.to) : undefined;

    const dateRange = from && to ? { from, to } : undefined;
    const stats = await getSalesDashboardStats(dateRange);
    const serializedOrders = serializeData(stats.recentOrders);

    // Cast stats to SalesMetrics for components that expect it
    // stats includes SalesMetrics properties + operational snapshots
    const analyticsData = stats as unknown as SalesMetrics;

    return (
        <div className="flex flex-col space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <PageHeader
                    title="Sales Dashboard"
                    description="Overview of sales performance."
                />
                <div className="flex items-center gap-2">
                    <AnalyticsToolbar />
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Total Revenue (Period)
                        </CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatRupiah(stats.totalRevenue)}</div>
                        <p className="text-xs text-muted-foreground">
                            {stats.revenueTrend.length > 0 ? 'Based on selected period' : 'No data'}
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

            {/* Analytics Section */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <RevenueChart data={stats.revenueTrend} />
                <TopProductsList data={analyticsData} />
            </div>

            {/* Additional Analytics / Customers */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <div className="col-span-4">
                    {/* Spacer or future chart */}
                </div>
                <TopCustomersList data={analyticsData} />
            </div>

            {/* Recent Orders Table */}
            <div className="grid gap-4 md:grid-cols-1">
                <Card>
                    <CardHeader>
                        <CardTitle>Recent Sales Orders</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        <SalesOrderTable initialData={serializedOrders as any} basePath="/sales/orders" />
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
