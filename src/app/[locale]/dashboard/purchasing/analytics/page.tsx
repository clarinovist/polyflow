
import { getPurchasingAnalytics } from '@/actions/purchasing-analytics';
import { PurchaseSpendChart } from '@/components/analytics/PurchaseSpendChart';
import { TopSuppliersCard } from '@/components/analytics/TopSuppliersCard';
import { PurchaseStatusChart } from '@/components/analytics/PurchaseStatusChart';
import { APAgingCard } from '@/components/analytics/APAgingCard';
import { AnalyticsToolbar } from '@/components/analytics/AnalyticsToolbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatRupiah } from '@/lib/utils';
import { DollarSign, Users, ShoppingCart, Truck } from 'lucide-react';

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function PurchasingAnalyticsPage(props: { searchParams: SearchParams }) {
    const searchParams = await props.searchParams;
    const from = typeof searchParams.from === 'string' ? new Date(searchParams.from) : undefined;
    const to = typeof searchParams.to === 'string' ? new Date(searchParams.to) : undefined;

    const dateRange = from && to ? { from, to } : undefined;

    const data = await getPurchasingAnalytics(dateRange);

    // Calculate KPIs
    const totalSpend = data.spendTrend.chartData.reduce((acc, curr) => acc + curr.spend, 0);
    const totalOpenOrders = data.statusBreakdown
        .filter(s => ['ISSUED', 'SENT', 'CONFIRMED', 'PARTIAL_RECEIVED'].includes(s.status))
        .reduce((acc, curr) => acc + curr.count, 0);
    const overdueAP = data.apAging
        .filter(i => i.range !== 'Current')
        .reduce((acc, curr) => acc + curr.amount, 0);
    const topSupplier = data.topSuppliers[0];

    return (
        <div className="p-6 space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <h1 className="text-3xl font-bold tracking-tight">Purchasing Analytics</h1>
                <AnalyticsToolbar />
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Spend (Period)</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {formatRupiah(totalSpend)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Based on ordered amount
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Open Orders</CardTitle>
                        <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {totalOpenOrders}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Pending completion
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Top Supplier</CardTitle>
                        <Truck className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl font-bold truncate" title={topSupplier?.supplierName || '-'}>
                            {topSupplier?.supplierName || '-'}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {topSupplier ? formatRupiah(topSupplier.totalSpend) : 'No spend'}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Overdue AP</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">
                            {formatRupiah(overdueAP)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Needs payment
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <PurchaseSpendChart data={data.spendTrend.chartData} />
                <TopSuppliersCard data={data.topSuppliers} />
            </div>

            {/* Charts Row 2 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <PurchaseStatusChart data={data.statusBreakdown} />
                <APAgingCard data={data.apAging} />
            </div>
        </div>
    );
}
