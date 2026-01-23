import {
    getInventoryStats,
    getInventoryAsOf,
    getDashboardStats,
    getInventoryTurnover,
    getDaysOfInventoryOnHand,
} from '@/actions/inventory';
import { ABCAnalysisService } from '@/services/abc-analysis-service';
import { canViewPrices } from '@/actions/permissions';
import { InventoryWithRelations } from '@/types/inventory';
import { CardContent } from '@/components/ui/card';
import { InventoryTable, InventoryItem } from '@/components/inventory/InventoryTable';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Box, Activity, CalendarClock } from 'lucide-react';
import { serializeData, formatRupiah, cn } from '@/lib/utils';


interface SimplifiedInventory {
    productVariantId: string;
    locationId: string;
    quantity: number;
}

export default async function InventoryDashboard({
    searchParams,
}: {
    searchParams: Promise<{
        locationId?: string;
        type?: string;
        lowStock?: string;
        asOf?: string;
        compareWith?: string;
    }>;
}) {
    const params = await searchParams;
    const asOfDate = params.asOf ? new Date(params.asOf) : null;
    const compareDate = params.compareWith ? new Date(params.compareWith) : null;

    // Fetch data in parallel
    const [
        liveInventory,
        dashboardStats,
        turnoverStats,
        dohStats,
    ] = await Promise.all([
        getInventoryStats(),
        getDashboardStats(),
        getInventoryTurnover(),
        getDaysOfInventoryOnHand(),
    ]);

    const showPrices = await canViewPrices();

    // Parse active location IDs (support multi-select)
    const activeLocationIds = params.locationId
        ? (Array.isArray(params.locationId) ? params.locationId : [params.locationId])
        : [];



    // Initialize table inventory with live data
    let tableInventory: (InventoryWithRelations | SimplifiedInventory)[] = liveInventory;

    // Phase 1: Historical Data Logic (Only affects Table)
    if (asOfDate) {
        const historicalInventory = await getInventoryAsOf(asOfDate);

        // Map historical quantities to a new tableInventory array
        tableInventory = liveInventory.map(item => {
            const histItem = historicalInventory.find(
                h => h.productVariantId === item.productVariantId && h.locationId === item.locationId
            );
            return {
                ...item,
                quantity: histItem ? histItem.quantity : 0
            };
        });
    }

    // Phase 2: Comparison logic (Only affects Table)
    const comparisonData: Record<string, number> = {};
    if (compareDate) {
        const compInventory = await getInventoryAsOf(compareDate);
        compInventory.forEach(item => {
            const key = `${item.productVariantId}-${item.locationId}`;
            comparisonData[key] = item.quantity;
        });
    }

    // Phase 3: Location Filtering (Live + History + Comparison)
    // If activeLocationIds are present, filter by checking if item's locationId is in the list
    let processedInventory = tableInventory;
    if (activeLocationIds.length > 0) {
        processedInventory = tableInventory.filter(item => activeLocationIds.includes(item.locationId));
    }

    // Phase 2: ABC Analysis (Global)
    let abcMap: Record<string, string> | undefined;
    try {
        const abcResults = await ABCAnalysisService.calculateABCClassification();
        abcMap = abcResults.reduce((acc: Record<string, string>, item) => {
            acc[item.productVariantId] = item.class;
            return acc;
        }, {} as Record<string, string>);
    } catch (e) {
        console.error('Failed to calculate ABC:', e);
    }

    // --- LOGIC B: TABLE (RESPECTS DATE) ---
    // Calculate totals for table data (historical or live) - grouped by variant for the current filtered view
    const tableVariantTotals = processedInventory.reduce((acc: Record<string, number>, item) => {
        const id = item.productVariantId;
        const qty = typeof item.quantity === 'number' ? item.quantity : item.quantity.toNumber();
        acc[id] = (acc[id] || 0) + qty;
        return acc;
    }, {} as Record<string, number>);

    // Helper for table filtering (Low Stock)
    const isTableGlobalLowStock = (item: InventoryWithRelations | SimplifiedInventory) => {
        const liveItem = liveInventory.find(li => li.productVariantId === item.productVariantId);
        const threshold = liveItem?.productVariant.minStockAlert?.toNumber();
        if (!threshold) return false;

        // Check if the TOTAL stock for this variant (in the current filtered view) is below threshold
        return tableVariantTotals[item.productVariantId] < threshold;
    };

    // Filter table inventory for display (Low Stock Filter)
    let displayInventory = processedInventory;
    const isLowStockFilter = params.lowStock === 'true';

    if (isLowStockFilter) {
        displayInventory = displayInventory.filter(isTableGlobalLowStock);
    }






    // Calculate displayed total stock based on filtered view
    const displayedTotalStock = activeLocationIds.length > 0
        ? displayInventory.reduce((acc, item) => {
            const qty = typeof item.quantity === 'number' ? item.quantity : item.quantity.toNumber();
            return acc + qty;
        }, 0)
        : dashboardStats.totalStock;

    // Calculate displayed total value based on filtered view
    const displayedTotalValue = activeLocationIds.length > 0
        ? displayInventory.reduce((acc, item) => {
            if ('productVariant' in item) {
                const qty = typeof item.quantity === 'number' ? item.quantity : item.quantity.toNumber();
                const price = item.productVariant.price ? item.productVariant.price.toNumber() : 0;
                return acc + (qty * price);
            }
            return acc;
        }, 0)
        : 0;

    const finalTotalValue = activeLocationIds.length > 0
        ? displayedTotalValue
        : liveInventory.reduce((acc, item) => {
            const qty = typeof item.quantity === 'number' ? item.quantity : item.quantity.toNumber();
            const price = item.productVariant.price ? item.productVariant.price.toNumber() : 0;
            return acc + (qty * price);
        }, 0);


    // Serialize Decimal fields for client component
    const serializedInventory = serializeData(displayInventory) as InventoryItem[];


    return (
        <div className="h-[calc(100vh-2rem)] flex flex-col space-y-4 p-6 overflow-hidden bg-[#fafafa]">
            {/* Professional Strategic Header */}
            <div className="flex items-end justify-between shrink-0 mb-2">
                <div>
                    <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Inventory Analysis</h1>
                    <p className="text-sm text-zinc-500 mt-1 font-geist">Strategic oversight of performance & stock health</p>
                </div>

                <div className="flex items-center gap-10">
                    <StatBlock
                        label="Turnover Ratio"
                        value={turnoverStats.turnoverRatio}
                        icon={<Activity className="h-4 w-4" />}
                        color="text-zinc-900"
                    />
                    <StatBlock
                        label="Days on Hand"
                        value={dohStats.daysOnHand.toFixed(1)}
                        icon={<CalendarClock className="h-4 w-4" />}
                        color="text-zinc-900"
                    />
                    <StatBlock
                        label="Low Stock Alert"
                        value={dashboardStats.lowStockCount}
                        icon={<AlertCircle className="h-4 w-4 text-amber-600" />}
                        color="text-amber-600"
                    />
                    <StatBlock
                        label="Active SKUs"
                        value={liveInventory.length}
                        icon={<Box className="h-4 w-4" />}
                        color="text-zinc-900"
                    />
                </div>
            </div>

            {/* Main Content Area - Card-less for Modern ERP Feel */}
            <div className="flex-1 overflow-hidden min-h-0">
                <div className="h-full flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
                    <CardContent suppressHydrationWarning className="p-0 flex-1 overflow-hidden">
                        <div className="h-full overflow-auto">
                            <InventoryTable
                                inventory={serializedInventory}
                                variantTotals={tableVariantTotals}
                                comparisonData={comparisonData}
                                showComparison={!!compareDate}
                                initialDate={params.asOf}
                                initialCompareDate={params.compareWith}
                                showPrices={showPrices}
                                abcMap={abcMap}
                                // Passing badges as props to let InventoryTable render them in its filter row
                                topBadges={
                                    <div className="flex items-center gap-2">
                                        <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-100 flex items-center gap-1.5 px-2 py-0 text-[10px] font-medium h-6">
                                            <span className="font-bold">{displayedTotalStock.toLocaleString()}</span>
                                            <span className="opacity-70">units</span>
                                        </Badge>
                                        {showPrices && (
                                            <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100 flex items-center gap-1.5 px-2 py-0 text-[10px] font-medium h-6">
                                                <span className="font-bold">{formatRupiah(finalTotalValue)}</span>
                                                <span className="opacity-70">value</span>
                                            </Badge>
                                        )}
                                        {asOfDate && (
                                            <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-amber-100 text-[10px] h-6 px-2">
                                                Snapshot: {format(asOfDate, 'MMM d')}
                                            </Badge>
                                        )}
                                    </div>
                                }
                            />
                        </div>
                    </CardContent>
                </div>
            </div>
        </div>
    );
}

function StatBlock({ label, value, icon, color }: { label: string, value: string | number, icon: React.ReactNode, color: string }) {
    return (
        <div className="flex flex-col items-start gap-1">
            <div className="flex items-center gap-2">
                <div className={cn("opacity-40", color)}>{icon}</div>
                <p className="text-2xl font-bold tracking-tight text-zinc-900 leading-none">{value}</p>
            </div>
            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest leading-none pl-6">{label}</p>
        </div>
    );
}



