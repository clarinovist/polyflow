import {
    getInventoryValuation,
    getInventoryTurnover,
    getDaysOfInventoryOnHand,
    getDashboardStats,
    getSuggestedPurchases,
    getInventoryStats,
} from '@/actions/inventory/inventory';
import { ABCAnalysisService } from '@/services/inventory/abc-analysis-service';
import { StockAgingService } from '@/services/inventory/stock-aging-service';
import { canViewPrices } from '@/actions/admin/permissions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatRupiah, cn, toDecimalNumber } from '@/lib/utils/utils';
import {
    Activity,
    CalendarClock,
    AlertTriangle,
    DollarSign,
    BarChart3,
    Clock,
    ArrowRight,
    ShoppingCart,
    TrendingDown,
    Package,
} from 'lucide-react';
import Link from 'next/link';
import { WAREHOUSE_SLUGS } from '@/lib/constants/locations';

export const metadata = {
    title: 'Analitik Gudang | PolyFlow Warehouse',
};

/** Low stock IDs using RM/FG warehouse qty vs minStockAlert (align with board). */
function computeLowStockVariantIds(
    inventory: Array<{
        productVariantId: string;
        quantity: unknown;
        productVariant?: { minStockAlert?: unknown };
        location?: { slug?: string | null } | null;
    }>,
): Set<string> {
    const allowedSlugs = new Set<string>([WAREHOUSE_SLUGS.RAW_MATERIAL, WAREHOUSE_SLUGS.FINISHING]);
    const totals = new Map<string, number>();
    const thresholds = new Map<string, number>();

    for (const item of inventory) {
        const slug = item.location?.slug;
        if (!slug || !allowedSlugs.has(slug)) continue;
        const id = item.productVariantId;
        totals.set(id, (totals.get(id) || 0) + toDecimalNumber(item.quantity));
        if (item.productVariant?.minStockAlert != null && !thresholds.has(id)) {
            thresholds.set(id, toDecimalNumber(item.productVariant.minStockAlert));
        }
    }

    const low = new Set<string>();
    for (const [id, total] of totals) {
        const threshold = thresholds.get(id) || 0;
        if (threshold > 0 && total < threshold) low.add(id);
    }
    return low;
}

export default async function AnalyticsDashboard() {
    const [
        valuationRes,
        turnoverRes,
        dohRes,
        dashboardRes,
        agingSummaryRes,
        suggestedPurchasesRes,
        inventoryRes,
    ] = await Promise.all([
        getInventoryValuation(),
        getInventoryTurnover(),
        getDaysOfInventoryOnHand(),
        getDashboardStats(),
        StockAgingService.getAgingSummary(),
        getSuggestedPurchases(),
        getInventoryStats(),
    ]);

    const valuation = valuationRes.success && valuationRes.data ? valuationRes.data : { totalValuation: 0, financeValuation: 0, customerOwnedValuation: 0 };
    const turnover = turnoverRes.success && turnoverRes.data ? turnoverRes.data : { turnoverRatio: 0, cogs: 0, averageInventory: 0 };
    const doh = dohRes.success && dohRes.data ? dohRes.data : { daysOnHand: 0 };
    const dashboard = dashboardRes.success && dashboardRes.data ? dashboardRes.data : { totalStock: 0, lowStockCount: 0, suggestedPurchasesCount: 0 };
    const agingSummary = agingSummaryRes;
    const suggestedPurchases = suggestedPurchasesRes.success && suggestedPurchasesRes.data ? suggestedPurchasesRes.data : [];
    const liveInventory = inventoryRes.success && inventoryRes.data ? inventoryRes.data : [];

    const showPricesRes = await canViewPrices();
    const showPrices = showPricesRes.success && showPricesRes.data ? showPricesRes.data : false;

    let abcResults: Array<{ productVariantId: string; class: string; name: string; skuCode: string; currentStock: number }> = [];
    let abcSummary = { a: 0, b: 0, c: 0 };
    try {
        abcResults = await ABCAnalysisService.calculateABCClassification();
        abcSummary = {
            a: abcResults.filter(i => i.class === 'A').length,
            b: abcResults.filter(i => i.class === 'B').length,
            c: abcResults.filter(i => i.class === 'C').length,
        };
    } catch {
        // ABC not available
    }

    // Class A at risk: class A + (low stock OR aging 90+) — plan D6
    const agingDetails = await StockAgingService.calculateStockAging();
    const aging90PlusMap = new Map<string, number>();
    agingDetails.forEach(item => {
        const qty90Plus = item.buckets['90+']?.quantity || 0;
        if (qty90Plus > 0) {
            aging90PlusMap.set(item.productVariantId, qty90Plus);
        }
    });

    const lowStockVariantIds = computeLowStockVariantIds(liveInventory as never);

    const classARisk = abcResults
        .filter(item => item.class === 'A')
        .filter(item => {
            const isLowStock = lowStockVariantIds.has(item.productVariantId);
            const hasAging90 = aging90PlusMap.has(item.productVariantId);
            return isLowStock || hasAging90;
        })
        .slice(0, 10);

    // Slow moving: items with 90+ bucket quantity > 0
    const slowMoving = agingDetails
        .filter(item => (item.buckets['90+']?.quantity || 0) > 0)
        .sort((a, b) => (b.buckets['90+']?.quantity || 0) - (a.buckets['90+']?.quantity || 0))
        .slice(0, 10);

    return (
        <div className="p-6 max-w-[1600px] mx-auto space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-foreground tracking-tight">Analitik Gudang</h1>
                <p className="text-sm text-muted-foreground mt-1">Kesehatan stok + daftar yang perlu ditindak.</p>
            </div>

            {/* Primary KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <KPICard
                    title="Nilai Stok"
                    value={showPrices ? formatRupiah(valuation.totalValuation) : '—'}
                    icon={<DollarSign className="h-4 w-4" />}
                    color="text-emerald-600 dark:text-emerald-400"
                />
                <KPICard
                    title="Perputaran Stok"
                    value={turnover.turnoverRatio.toString()}
                    suffix="x"
                    icon={<Activity className="h-4 w-4" />}
                    color="text-blue-600 dark:text-blue-400"
                />
                <KPICard
                    title="Hari Bertahan"
                    value={doh.daysOnHand.toFixed(1)}
                    suffix="hari"
                    icon={<CalendarClock className="h-4 w-4" />}
                    color="text-purple-600 dark:text-purple-400"
                />
                <KPICard
                    title="Stok Menipis"
                    value={dashboard.lowStockCount.toString()}
                    icon={<AlertTriangle className="h-4 w-4" />}
                    color={dashboard.lowStockCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}
                />
                <KPICard
                    title="Perlu Reorder"
                    value={(dashboard.suggestedPurchasesCount || suggestedPurchases.length).toString()}
                    icon={<ShoppingCart className="h-4 w-4" />}
                    color={suggestedPurchases.length > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}
                />
            </div>

            {/* Actionable Lists */}
            <Card id="reorder">
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                        Perlu Ditindak
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Low Stock */}
                        <div className="space-y-3">
                            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                                <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                                Stok Menipis
                            </h3>
                            {dashboard.lowStockCount === 0 ? (
                                <p className="text-xs text-muted-foreground italic">Tidak ada stok menipis — bagus</p>
                            ) : (
                                <Link href="/warehouse/inventory?lowStock=true" className="block">
                                    <div className="p-3 rounded-lg border bg-red-500/5 hover:bg-red-500/10 transition-colors cursor-pointer">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-bold text-red-600">{dashboard.lowStockCount} item di bawah minimum</span>
                                            <ArrowRight className="h-4 w-4 text-red-500" />
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-1">Klik untuk melihat daftar lengkap</p>
                                    </div>
                                </Link>
                            )}
                        </div>

                        {/* Suggested Reorder */}
                        <div className="space-y-3">
                            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                                <ShoppingCart className="h-3.5 w-3.5 text-purple-500" />
                                Perlu Reorder
                            </h3>
                            {suggestedPurchases.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic">Tidak ada item perlu reorder</p>
                            ) : (
                                <div className="space-y-1">
                                    {suggestedPurchases.slice(0, 10).map((item) => (
                                        <Link
                                            key={item.id}
                                            href={`/warehouse/inventory/${item.id}`}
                                            className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors group"
                                        >
                                            <div className="flex items-center gap-2 min-w-0">
                                                <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                                <div className="min-w-0">
                                                    <p className="text-xs font-medium truncate">{item.name}</p>
                                                    <p className="text-[10px] text-muted-foreground">{item.skuCode}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className="text-[10px] text-muted-foreground">
                                                    Stok: {item.totalStock} / Reorder: {item.reorderPoint != null ? Number(item.reorderPoint) : '—'}
                                                </span>
                                                <ArrowRight className="h-3 w-3 text-muted-foreground group-hover:text-primary" />
                                            </div>
                                        </Link>
                                    ))}
                                    {suggestedPurchases.length > 10 && (
                                        <p className="text-xs text-muted-foreground text-center pt-1">
                                            +{suggestedPurchases.length - 10} item lain (total {suggestedPurchases.length})
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Slow Moving */}
                        <div className="space-y-3">
                            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                                <Clock className="h-3.5 w-3.5 text-orange-500" />
                                Slow Moving (&gt;90 hari)
                            </h3>
                            {slowMoving.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic">Tidak ada item slow moving</p>
                            ) : (
                                <div className="space-y-1">
                                    {slowMoving.slice(0, 5).map((item) => (
                                        <Link
                                            key={item.productVariantId}
                                            href={`/warehouse/inventory/${item.productVariantId}`}
                                            className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors group"
                                        >
                                            <div className="flex items-center gap-2 min-w-0">
                                                <Clock className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                                                <div className="min-w-0">
                                                    <p className="text-xs font-medium truncate">{item.name}</p>
                                                    <p className="text-[10px] text-muted-foreground">{item.skuCode}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <Badge variant="outline" className="text-[10px] text-orange-600 border-orange-200">
                                                    {item.buckets['90+']?.quantity || 0} unit &gt;90h
                                                </Badge>
                                                <ArrowRight className="h-3 w-3 text-muted-foreground group-hover:text-primary" />
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Class A Risk */}
                        <div className="space-y-3">
                            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                                <BarChart3 className="h-3.5 w-3.5 text-emerald-500" />
                                Class A Risk
                            </h3>
                            {classARisk.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic">Tidak ada Class A berisiko</p>
                            ) : (
                                <div className="space-y-1">
                                    {classARisk.slice(0, 5).map((item) => (
                                        <Link
                                            key={item.productVariantId}
                                            href={`/warehouse/inventory/${item.productVariantId}`}
                                            className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors group"
                                        >
                                            <div className="flex items-center gap-2 min-w-0">
                                                <BarChart3 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                                <div className="min-w-0">
                                                    <p className="text-xs font-medium truncate">{item.name}</p>
                                                    <p className="text-[10px] text-muted-foreground">{item.skuCode}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-200">
                                                    Class A
                                                </Badge>
                                                <ArrowRight className="h-3 w-3 text-muted-foreground group-hover:text-primary" />
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

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
                            <Link href="/warehouse/inventory/aging" className="block">
                                <p className="text-xs text-primary font-medium hover:underline flex items-center gap-1">
                                    Detail Aging <ArrowRight className="h-3 w-3" />
                                </p>
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Quick Links */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Link href="/warehouse/inventory">
                    <QuickLinkCard title="Stok" description="Lihat tabel inventaris lengkap" />
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
