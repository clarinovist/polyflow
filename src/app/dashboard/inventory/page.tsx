import { getInventoryStats, getLocations, getInventoryAsOf, InventoryWithRelations, getDashboardStats } from '@/actions/inventory';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InventoryTable } from '@/components/inventory/InventoryTable';
import { WarehouseNavigator } from '@/components/inventory/WarehouseNavigator';
import { InventoryInsightsPanel } from '@/components/inventory/InventoryInsightsPanel';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Box, PackageCheck } from 'lucide-react';

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
    const [liveInventory, locations, dashboardStats] = await Promise.all([
        getInventoryStats(),
        getLocations(),
        getDashboardStats(),
    ]);

    // Parse active location IDs (support multi-select)
    const activeLocationIds = params.locationId
        ? (Array.isArray(params.locationId) ? params.locationId : [params.locationId])
        : [];

    const activeLocation = activeLocationIds.length === 1
        ? locations.find((l) => l.id === activeLocationIds[0])
        : null;

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

    // Calculate location summaries for Navigator
    // We want to know how many SKUs are in each location, and how many are low stock GLOBALLY? 
    // Or low stock in that location?
    // Originally: locInventory.filter(isLiveGlobalLowStock).length
    // We should preserve the original dashboard stats logic for the sidebar usually, 
    // but maybe simplified.
    // Let's reuse the logic I saw in the file previously or reconstruct it.

    // Reconstruct `isLiveGlobalLowStock` logic for sidebar counts if needed
    // But actually, `dashboardStats` might have some pre-calc?
    // The previous code calculated it manually.

    // Calculate global totals for LIVE data (for accurate sidebar "low stock" counts per location)
    const liveVariantTotals = liveInventory.reduce((acc: Record<string, number>, item: InventoryWithRelations) => {
        const id = item.productVariantId;
        acc[id] = (acc[id] || 0) + (typeof item.quantity === 'number' ? item.quantity : item.quantity.toNumber());
        return acc;
    }, {} as Record<string, number>);

    const isLiveGlobalLowStock = (item: InventoryWithRelations) => {
        const threshold = item.productVariant.minStockAlert?.toNumber();
        if (!threshold) return false;
        return liveVariantTotals[item.productVariantId] < threshold;
    };

    const locationSummaries = locations.map((loc) => {
        const locInventory = liveInventory.filter((item) => item.locationId === loc.id);
        const lowStockCount = locInventory.filter(isLiveGlobalLowStock).length;

        return {
            ...loc,
            totalSkus: locInventory.length,
            lowStockCount,
        };
    });

    // Determine title
    let pageTitle = "Global Stock Positions";
    if (activeLocationIds.length === 1) {
        pageTitle = `Stock in ${activeLocation?.name || 'Warehouse'}`;
    } else if (activeLocationIds.length > 1) {
        pageTitle = `Stock in ${activeLocationIds.length} Locations`;
    }

    // Calculate displayed total stock based on filtered view
    const displayedTotalStock = activeLocationIds.length > 0
        ? displayInventory.reduce((acc, item) => {
            const qty = typeof item.quantity === 'number' ? item.quantity : item.quantity.toNumber();
            return acc + qty;
        }, 0)
        : dashboardStats.totalStock;

    // Serialize Decimal fields for client component
    const serializedInventory = JSON.parse(
        JSON.stringify(displayInventory, (key, value) => {
            if (value && typeof value === 'object' && value.constructor?.name === 'Decimal') {
                return parseFloat(value.toString());
            }
            return value;
        })
    );

    return (
        <div className="h-[calc(100vh-2rem)] flex flex-col space-y-4 p-6 overflow-hidden">
            {/* Page Header */}
            <div className="flex items-center justify-between shrink-0">
                <div>
                    <h1 className="text-3xl font-bold text-foreground">Inventory Overview</h1>
                    <p className="text-muted-foreground mt-1">Monitor stock levels across all warehouse locations</p>
                </div>
            </div>

            {/* 2-Column Grid Layout - Takes remaining height */}
            <div className="grid grid-cols-12 gap-6 flex-1 overflow-hidden">

                {/* Left Column: Warehouse Navigator + Inventory Actions (3 cols) */}
                <div className="col-span-12 lg:col-span-3 flex flex-col gap-4 h-full overflow-hidden">

                    {/* Warehouse Navigator (Scrollable list inside) - Comes FIRST now */}
                    <div className="flex-1 overflow-hidden min-h-0">
                        <WarehouseNavigator
                            locations={locationSummaries}
                            activeLocationIds={activeLocationIds} // Pass array
                            totalSkus={liveInventory.length}
                            totalLowStock={dashboardStats.lowStockCount}
                        />
                    </div>

                    {/* Inventory Actions (Fixed at bottom of left column) */}
                    <div className="shrink-0">
                        <InventoryInsightsPanel
                            activeLocationId={activeLocationIds.length === 1 ? activeLocationIds[0] : undefined}
                        />
                    </div>
                </div>

                {/* Center Column: Stock Table (9 cols) */}
                <div className="col-span-12 lg:col-span-9 h-full flex flex-col overflow-hidden">
                    <Card className="border shadow-sm bg-card h-full flex flex-col overflow-hidden">
                        <CardHeader className="border-b bg-muted/50 py-4 shrink-0">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                                        <Box className="h-4 w-4 text-muted-foreground" />
                                        {pageTitle}
                                    </CardTitle>
                                    {/* Total Stock Badge */}
                                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 border-emerald-200 flex items-center gap-1.5 px-2.5 py-1">
                                        <PackageCheck className="h-3.5 w-3.5" />
                                        <span className="font-semibold">{displayedTotalStock.toLocaleString()}</span>
                                        <span className="text-emerald-600 font-normal">total stock</span>
                                    </Badge>
                                </div>
                                {asOfDate && (
                                    <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-amber-200">
                                        <AlertCircle className="h-3 w-3 mr-1" />
                                        History: {format(asOfDate, 'MMM d, yyyy')}
                                    </Badge>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent suppressHydrationWarning className="p-0 flex-1 overflow-hidden">
                            <div className="h-full overflow-auto p-4">
                                <InventoryTable
                                    inventory={serializedInventory}
                                    variantTotals={tableVariantTotals}
                                    comparisonData={comparisonData}
                                    showComparison={!!compareDate}
                                    initialDate={params.asOf}
                                    initialCompareDate={params.compareWith}
                                />
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

// Reuse helper
function isLowStock(item: any) {
    return item.quantity <= (item.productVariant.minStockAlert || 0);
}
