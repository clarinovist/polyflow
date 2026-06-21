import { getSalesDashboardStats } from '@/actions/dashboard/sales-dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SalesOrderTable } from '@/components/sales/SalesOrderTable';
import { serializeData, formatRupiah } from '@/lib/utils/utils';
import { Package, ShoppingCart, TrendingUp, Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { AnalyticsToolbar } from '@/components/analytics/AnalyticsToolbar';
import { RevenueChart } from '@/components/sales/analytics/RevenueChart';
import { TopProductsList, TopCustomersList } from '@/components/sales/analytics/TopLists';
import { salesLabels } from '@/lib/labels';

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function SalesDashboardPage(props: { searchParams: SearchParams }) {
    const searchParams = await props.searchParams;
    const from = typeof searchParams.from === 'string' ? new Date(searchParams.from) : undefined;
    const to = typeof searchParams.to === 'string' ? new Date(searchParams.to) : undefined;

    const dateRange = from && to ? { from, to } : undefined;
    const statsRes = await getSalesDashboardStats(dateRange);
    const stats = statsRes.success && statsRes.data ? statsRes.data : {
        totalRevenue: 0,
        revenueTrend: [],
        activeOrders: 0,
        pendingDeliveries: 0,
        activeCustomers: 0,
        recentOrders: [],
        topProducts: [],
        topCustomers: [],
        monthlyRevenue: []
    };
    
    const serializedOrders = serializeData(stats.recentOrders);

    return (
        <div className="flex flex-col space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <PageHeader
                    title={salesLabels.salesDashboard}
                    description={salesLabels.salesDashboardDesc}
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
                            {salesLabels.totalRevenuePeriod}
                        </CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatRupiah(stats.totalRevenue)}</div>
                        <p className="text-xs text-muted-foreground">
                            {stats.revenueTrend.length > 0 ? 'Berdasarkan periode terpilih' : salesLabels.noData}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            {salesLabels.activeOrders}
                        </CardTitle>
                        <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.activeOrders}</div>
                        <p className="text-xs text-muted-foreground">
                            {salesLabels.ordersInProgress}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            {salesLabels.pendingDeliveries}
                        </CardTitle>
                        <Package className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.pendingDeliveries}</div>
                        <p className="text-xs text-muted-foreground">
                            {salesLabels.readyToShip}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            {salesLabels.activeCustomers}
                        </CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.activeCustomers}</div>
                        <p className="text-xs text-muted-foreground">
                            {salesLabels.totalActiveBase}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Analytics Section */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <RevenueChart data={stats.revenueTrend} />
                <TopProductsList data={stats.topProducts} />
            </div>

            {/* Additional Analytics / Customers */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <div className="col-span-4">
                    {/* Spacer or future chart */}
                </div>
                <TopCustomersList data={stats.topCustomers} />
            </div>

            {/* Recent Orders Table */}
            <div className="grid gap-4 md:grid-cols-1">
                <Card>
                    <CardHeader>
                        <CardTitle>{salesLabels.recentSalesOrders}</CardTitle>
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
