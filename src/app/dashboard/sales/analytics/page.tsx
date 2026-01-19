import { getSalesAnalytics } from '@/actions/analytics';
import { SalesRevenueChart } from '@/components/analytics/SalesRevenueChart';
import { SalesPipelineChart } from '@/components/analytics/SalesPipelineChart';
import { TopProductsCard } from '@/components/analytics/TopProductsCard';
import { ARAgingCard } from '@/components/analytics/ARAgingCard';
import { AnalyticsToolbar } from '@/components/analytics/AnalyticsToolbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatRupiah } from '@/lib/utils';
import { DollarSign, TrendingUp, ShoppingBag, Users } from 'lucide-react';

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function AnalyticsPage(props: { searchParams: SearchParams }) {
    const searchParams = await props.searchParams;
    const from = typeof searchParams.from === 'string' ? new Date(searchParams.from) : undefined;
    const to = typeof searchParams.to === 'string' ? new Date(searchParams.to) : undefined;

    const dateRange = from && to ? { from, to } : undefined;

    const data = await getSalesAnalytics(dateRange);

    return (
        <div className="p-6 space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <h1 className="text-3xl font-bold tracking-tight">Sales Analytics</h1>
                <AnalyticsToolbar />
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Revenue (MTD)</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {formatRupiah(data.revenueTrend.reduce((acc: number, curr) => acc + curr.revenue, 0))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Based on confirmed orders
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Pipeline Value</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {formatRupiah(data.pipeline.reduce((acc: number, curr) => acc + curr.value, 0))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {data.pipeline.reduce((acc: number, curr) => acc + curr.count, 0)} active orders
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Top Product</CardTitle>
                        <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl font-bold truncate" title={data.topProducts[0]?.productName || '-'}>
                            {data.topProducts[0]?.productName || '-'}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {data.topProducts[0] ? `${data.topProducts[0].totalQuantity} units sold` : 'No sales yet'}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Overdue AR</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">
                            {formatRupiah(data.arAging.filter(i => i.range !== 'Current').reduce((acc: number, curr) => acc + curr.amount, 0))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Needs attention
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <SalesRevenueChart data={data.revenueTrend} />
                <TopProductsCard data={data.topProducts} />
            </div>

            {/* Charts Row 2 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <SalesPipelineChart data={data.pipeline} />
                <ARAgingCard data={data.arAging} />
            </div>
        </div>
    );
}
