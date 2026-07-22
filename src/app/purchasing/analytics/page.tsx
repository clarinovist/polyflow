import { getPurchasingAnalytics, getOverdueAPLines } from '@/actions/purchasing/purchasing-analytics';
import { PurchaseSpendChart } from '@/components/analytics/PurchaseSpendChart';
import { TopSuppliersCard } from '@/components/analytics/TopSuppliersCard';
import { PurchaseStatusChart } from '@/components/analytics/PurchaseStatusChart';
import { APAgingCard } from '@/components/analytics/APAgingCard';
import { AnalyticsToolbar } from '@/components/analytics/AnalyticsToolbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatRupiah } from '@/lib/utils/utils';
import { DollarSign, Users, ShoppingCart, Truck, ArrowRight, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function PurchasingAnalyticsPage(props: { searchParams: SearchParams }) {
    const searchParams = await props.searchParams;
    const from = typeof searchParams.from === 'string' ? new Date(searchParams.from) : undefined;
    const to = typeof searchParams.to === 'string' ? new Date(searchParams.to) : undefined;

    const dateRange = from && to ? { from, to } : undefined;

    const [dataRes, overdueRes] = await Promise.all([
        getPurchasingAnalytics(dateRange),
        getOverdueAPLines(10),
    ]);
    const data = dataRes.success && dataRes.data ? dataRes.data : {
        spendTrend: undefined,
        topSuppliers: undefined,
        statusBreakdown: undefined,
        apAging: undefined
    };
    const overdueLines = overdueRes.success && overdueRes.data ? overdueRes.data : [];

    const spendTrend = data.spendTrend || { periodSpend: 0, periodOrderCount: 0, spendGrowth: 0, orderCountGrowth: 0, chartData: [] };
    const statusBreakdown = data.statusBreakdown || [];
    const apAging = data.apAging || [];
    const topSuppliers = data.topSuppliers || [];

    const totalSpend = spendTrend.periodSpend;
    const totalOpenOrders = statusBreakdown
        .filter(s => ['ISSUED', 'SENT', 'CONFIRMED', 'PARTIAL_RECEIVED'].includes(s.status))
        .reduce((acc, curr) => acc + curr.count, 0);
    const overdueAP = apAging
        .filter(i => i.range !== 'Current')
        .reduce((acc, curr) => acc + curr.amount, 0);
    const topSupplier = topSuppliers[0];

    return (
        <div className="p-6 space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <h1 className="text-3xl font-bold tracking-tight">Analitik Pembelian</h1>
                <AnalyticsToolbar />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Belanja Periode</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {formatRupiah(totalSpend)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Berdasarkan total order non-batal
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">PO Terbuka</CardTitle>
                        <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {totalOpenOrders}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Dalam proses
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Supplier Teratas</CardTitle>
                        <Truck className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl font-bold truncate" title={topSupplier?.supplierName || '-'}>
                            {topSupplier?.supplierName || '-'}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {topSupplier ? formatRupiah(topSupplier.totalSpend) : 'Belum ada belanja'}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Hutang Jatuh Tempo</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                            {formatRupiah(overdueAP)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Perlu pembayaran
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <PurchaseSpendChart data={spendTrend.chartData} />
                <TopSuppliersCard data={topSuppliers} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <PurchaseStatusChart data={statusBreakdown} />
                <APAgingCard data={apAging} />
            </div>

            {/* Actionable overdue AP lines */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                        Hutang Jatuh Tempo (detail)
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {overdueLines.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic">Tidak ada hutang jatuh tempo.</p>
                    ) : (
                        <div className="space-y-2">
                            {overdueLines.map((line) => (
                                <div
                                    key={line.id}
                                    className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/30 text-sm"
                                >
                                    <div className="min-w-0">
                                        <span className="font-mono font-bold">{line.invoiceNumber}</span>
                                        <span className="text-xs text-muted-foreground ml-2">{line.supplierName}</span>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        <span className="text-xs font-medium text-destructive">
                                            {formatRupiah(line.remaining)}
                                        </span>
                                        <Link
                                            href="/finance/invoices/purchase"
                                            className="text-xs text-primary hover:underline flex items-center gap-0.5"
                                        >
                                            Finance <ArrowRight className="h-3 w-3" />
                                        </Link>
                                    </div>
                                </div>
                            ))}
                            <Link
                                href="/finance/invoices/purchase"
                                className="text-xs text-primary hover:underline flex items-center gap-1 mt-2"
                            >
                                Semua hutang di Finance <ArrowRight className="h-3 w-3" />
                            </Link>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
