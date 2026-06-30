import {
    getInventoryValuation,
    getInventoryTurnover,
    getDaysOfInventoryOnHand,
    getDashboardStats,
} from '@/actions/inventory/inventory';
import { ABCAnalysisService } from '@/services/inventory/abc-analysis-service';
import { StockAgingService } from '@/services/inventory/stock-aging-service';
import { canViewPrices } from '@/actions/admin/permissions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatRupiah, cn } from '@/lib/utils/utils';
import {
    Activity,
    CalendarClock,
    AlertTriangle,
    DollarSign,
    BarChart3,
    Clock,
    ArrowRight,
} from 'lucide-react';
import Link from 'next/link';

export const metadata = {
    title: 'Dashboard Analitik | PolyFlow Warehouse',
};

export default async function AnalyticsDashboard() {
    const [
        valuationRes,
        turnoverRes,
        dohRes,
        dashboardRes,
        agingSummaryRes,
    ] = await Promise.all([
        getInventoryValuation(),
        getInventoryTurnover(),
        getDaysOfInventoryOnHand(),
        getDashboardStats(),
        StockAgingService.getAgingSummary(),
    ]);

    const valuation = valuationRes.success && valuationRes.data ? valuationRes.data : { totalValuation: 0, financeValuation: 0, customerOwnedValuation: 0 };
    const turnover = turnoverRes.success && turnoverRes.data ? turnoverRes.data : { turnoverRatio: 0, cogs: 0, averageInventory: 0 };
    const doh = dohRes.success && dohRes.data ? dohRes.data : { daysOnHand: 0 };
    const dashboard = dashboardRes.success && dashboardRes.data ? dashboardRes.data : { totalStock: 0, lowStockCount: 0 };
    const agingSummary = agingSummaryRes;

    const showPricesRes = await canViewPrices();
    const showPrices = showPricesRes.success && showPricesRes.data ? showPricesRes.data : false;

    let abcSummary = { a: 0, b: 0, c: 0 };
    try {
        const abcResults = await ABCAnalysisService.calculateABCClassification();
        abcSummary = {
            a: abcResults.filter(i => i.class === 'A').length,
            b: abcResults.filter(i => i.class === 'B').length,
            c: abcResults.filter(i => i.class === 'C').length,
        };
    } catch {
        // ABC not available
    }

    return (
        <div className="p-6 max-w-[1600px] mx-auto space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-foreground tracking-tight">Dashboard Analitik</h1>
                <p className="text-sm text-muted-foreground mt-1">Ringkasan KPI dan kesehatan persediaan</p>
            </div>

            {/* Primary KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                    title="Total Nilai Stok"
                    value={showPrices ? formatRupiah(valuation.totalValuation) : '—'}
                    icon={<DollarSign className="h-4 w-4" />}
                    color="text-emerald-600 dark:text-emerald-400"
                />
                <KPICard
                    title="Turnover Ratio"
                    value={turnover.turnoverRatio.toString()}
                    suffix="x"
                    icon={<Activity className="h-4 w-4" />}
                    color="text-blue-600 dark:text-blue-400"
                />
                <KPICard
                    title="Days on Hand"
                    value={doh.daysOnHand.toFixed(1)}
                    suffix="hari"
                    icon={<CalendarClock className="h-4 w-4" />}
                    color="text-purple-600 dark:text-purple-400"
                />
                <KPICard
                    title="Low Stock Alert"
                    value={dashboard.lowStockCount.toString()}
                    icon={<AlertTriangle className="h-4 w-4" />}
                    color={dashboard.lowStockCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}
                />
            </div>

            {/* Secondary Row: ABC + Aging */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* ABC Classification */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <BarChart3 className="h-4 w-4 text-muted-foreground" />
                            Klasifikasi ABC
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-6">
                            <ABCBar label="A" count={abcSummary.a} total={abcSummary.a + abcSummary.b + abcSummary.c} color="bg-emerald-500" />
                            <ABCBar label="B" count={abcSummary.b} total={abcSummary.a + abcSummary.b + abcSummary.c} color="bg-amber-500" />
                            <ABCBar label="C" count={abcSummary.c} total={abcSummary.a + abcSummary.b + abcSummary.c} color="bg-red-500" />
                        </div>
                    </CardContent>
                </Card>

                {/* Stock Aging Summary */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            Ringkasan Aging Stok
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Total Item</span>
                                <span className="text-sm font-bold">{agingSummary.totalItems.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Rata-rata Umur</span>
                                <span className="text-sm font-bold">{agingSummary.avgDays.toFixed(0)} hari</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Slow Moving (&gt;90 hari)</span>
                                <span className={cn("text-sm font-bold", agingSummary.slowMovingCount > 0 ? 'text-red-600 dark:text-red-400' : '')}>
                                    {agingSummary.slowMovingCount.toLocaleString()} item
                                </span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Quick Links */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Link href="/warehouse/inventory">
                    <QuickLinkCard title="Kontrol Stok" description="Lihat tabel inventaris lengkap" />
                </Link>
                <Link href="/warehouse/inventory/aging">
                    <QuickLinkCard title="Detail Aging" description="Analisis umur stok per item" />
                </Link>
                <Link href="/warehouse/inventory/history">
                    <QuickLinkCard title="Riwayat Mutasi" description="Lacak semua pergerakan stok" />
                </Link>
            </div>
        </div>
    );
}

function KPICard({ title, value, suffix, icon, color }: {
    title: string;
    value: string;
    suffix?: string;
    icon: React.ReactNode;
    color: string;
}) {
    return (
        <Card>
            <CardContent className="p-4">
                <div className="flex items-start justify-between">
                    <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">{title}</p>
                        <div className="flex items-baseline gap-1">
                            <p className="text-2xl font-bold tracking-tight">{value}</p>
                            {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
                        </div>
                    </div>
                    <div className={cn("p-2 rounded-lg bg-muted/50", color)}>{icon}</div>
                </div>
            </CardContent>
        </Card>
    );
}

function ABCBar({ label, count, total, color }: {
    label: string;
    count: number;
    total: number;
    color: string;
}) {
    const pct = total > 0 ? (count / total) * 100 : 0;
    return (
        <div className="flex-1 space-y-1.5">
            <div className="flex items-center justify-between">
                <Badge variant="secondary" className="text-[10px] font-bold px-1.5 py-0 h-5">
                    {label}
                </Badge>
                <span className="text-xs text-muted-foreground">{count} item</span>
            </div>
            <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
                <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
            </div>
            <p className="text-[10px] text-muted-foreground text-right">{pct.toFixed(0)}%</p>
        </div>
    );
}

function QuickLinkCard({ title, description }: { title: string; description: string }) {
    return (
        <Card className="hover:border-primary/30 transition-colors cursor-pointer">
            <CardContent className="p-4 flex items-center justify-between">
                <div>
                    <p className="text-sm font-semibold">{title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
        </Card>
    );
}
